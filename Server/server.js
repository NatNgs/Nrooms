const os = require('os')
const config = require('./config.json')
const app = require('express')()
const server = require('http').createServer(app)
const cors = require('cors')
const compression = require('compression')
app.use(cors())
app.use(compression())
const io = require('socket.io')(server)
const minifier = require('./minifier')

const ACTIVITY_FORMAT = '[a-z0-9_]+'
const ROOM_CODE_FORMAT = '[A-Z0-9-]{4,12}'
const ROOM_CODE_REGEXP = new RegExp('^' + ROOM_CODE_FORMAT + '$')

function serverStart() {
	minifier.setDebug(!!config.debug)

	io.sockets.on('connection', onConnect)

	// Listing IP and ports available for connexion (LAN)
	console.info('Server open on:')
	Object.values(os.networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family) && console.info('\t' + iface.address + ':' + config.serverPort)
	))
	console.info() // Newline

	server.listen(config.serverPort)
}

const rooms = {} // roomId: {activity: <>, host: player1, roles: {role1: [player1, player2, ...], role2: [player1, player2, ...], ...}}
const players = {} // clientId: {socket: <>, room: roomId}

//
// HTTP REQUESTS
//
function getFile(folder, file, req, res, onError) {
	if(file.startsWith('common')) {
		folder = 'common'
		file = file.slice(folder.length+1)
	}

	if(!config.httpFolders[folder]) {
		onError()
		return
	} else {
		minifier.getFileAsync(
			config.httpFolders[folder] + '/' + file,
			folder + '/' + file,
			(f) => {
				console.debug('200: ' + req.originalUrl)
				res.sendFile(f)
			},
			onError
		)
	}
}

app.get('/', (req, res, nxt) => {
	getFile(config.defaultHttpFolder, 'index.html', req, res, nxt)
})
app.get('/:room('+ ROOM_CODE_FORMAT +'$)', (req, res) => res.redirect(req.url + '/'))
app.get('/:room('+ ROOM_CODE_FORMAT +')/', (req, res, nxt) => {
	// Check if room exists
	if(!(req.params.room in rooms)) return nxt()
	const activity = rooms[req.params.room].activity

	getFile(activity, 'index.html', req, res, nxt)
})
app.get('/:room('+ ROOM_CODE_FORMAT +')/*.*', (req, res, nxt) => {
	// Check if room exists
	if(!(req.params.room in rooms)) return nxt()

	const splitted = req.originalUrl.split('/')
	const baseURL = splitted.shift()
	const room = splitted.shift()
	const filePath = splitted.join('/')

	let newURL = baseURL + '/'
	if(!(filePath.startsWith(config.commonFolder + '/'))) {
		const activity = rooms[room].activity
		newURL += activity + '/'
	}

	newURL += filePath
	// console.debug('Redirecting ' + req.originalUrl + ' to ' + newURL)
	res.redirect(newURL)
})
app.get('/:activity('+ ACTIVITY_FORMAT +')/*.*', (req, res, nxt) => {
	const splitted = req.originalUrl.split('/')
	/* const baseURL = */ splitted.shift()
	const activity = splitted.shift()
	const file = splitted.join('/')
	getFile(activity, file, req, res, nxt)
})
app.get('*.*', (req, res, nxt) => {
	const splitted = req.originalUrl.split('/')
	/* const baseURL = */ splitted.shift()
	const file = splitted.join('/')
	getFile(config.defaultHttpFolder, file, req, res, nxt)
})
app.get('*', (req, res) => {
	console.warn('404: ' + req.originalUrl)
	res.status(404).send('404: Not Found')
})

//
// SOCKET
//
// io.emit('cmd', data) // broadcast
// socket.emit('cmd', data) // send command to specific
// io.to('roomName').emit('cmd', data) // send command to every socket in room
// socket.join('roomName') // add socket to room
// socket.leave('roomName') // remove socket from room
function onConnect(socket) {
	const connectBy = socket.handshake.headers.host

	const clientId = socket.id
	players[clientId] = {socket: socket}

	console.log('Player', clientId, 'connected from', connectBy)
	socket.on('disconnect', () => {
		console.log('Client', clientId, 'has been disconnected from', connectBy)
		if(players[clientId].room) {
			rmPlayerFromRoom(players[clientId].room, clientId)
		}
		delete players[clientId]
	})

	/**
	 * room: str
	 * type: str
	 */
	socket.on('create', (params, response) => {
		if(!params.room.match(ROOM_CODE_REGEXP)) {
			response({status: 'ko', err: 'Invalid room Id (\'' + params.room + '\' does not respect '+ ROOM_CODE_FORMAT + ')'})
		} else if(params.room in rooms) {
			response({status: 'ko', err: 'Room \'' + params.room + '\' already exists'})
		} else if(!(params.type in config.httpFolders)) {
			response({status: 'ko', err: 'Type of room \'' + params.type + '\' does not exist'})
		} else {
			rooms[params.room] = {activity: params.type, host: null, roles:{all: []}}
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 */
	socket.on('join', (params, response) => {
		if(!(params.room in rooms)) {
			response({status: 'ko', err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].room) {
			response({status: 'ko', err: 'Already joined the room'})
		} else {
			addPlayerRoles(params.room, clientId, ['all'])
			io.to(params.room + '/all').emit('connected', clientId, {player: clientId, room: getRoomDescription(params.room)})
			response({status: 'ok'})
		}
	})

	/**
	 * no parameters
	 */
	socket.on('leave', (params, response) => {
		if(!players[clientId].room) {
			response({status: 'ko', err: 'You are not a member of any room'})
		} else {
			rmPlayerFromRoom(players[clientId].room, clientId)
			response({status: 'ok'})
		}
	})

	/**
	 * player: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('addRoles', (params, response) => {
		const roomId = players[clientId].room
		if(!roomId) {
			response({status: 'ko', err: 'You are not a member of any room'})
		} else if(rooms[roomId].host !== clientId) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players) || players[params.player].room !== roomId) {
			response({status: 'ko', err: 'Player \'' + params.player + '\' is not in room \'' + roomId + '\''})
		} else {
			addPlayerRoles(roomId, params.player, params.roles)
			io.to(roomId + '/all').emit('connected', clientId, {player: params.player, room: getRoomDescription(roomId)})
			response({status: 'ok'})
		}
	})

	/**
	 * player: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('rmRoles', (params, response) => {
		const roomId = players[clientId].room
		if(!roomId) {
			response({status: 'ko', err: 'You are not a member of any room'})
		} else if(rooms[roomId].host !== clientId) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players) || players[params.player].room !== roomId) {
			response({status: 'ko', err: 'Player \'' + params.player + '\' is not in room \'' + roomId + '\''})
		} else if('host' in params.roles || 'all' in params.roles) {
			response({status: 'ko', err: 'Cannot remove host and all rôles'})
		} else {
			rmPlayerRoles(roomId, params.player, params.roles)
			io.to(roomId + '/all').emit('connected', clientId, {player: params.player, room: getRoomDescription(roomId)})
			response({status: 'ok'})
		}
	})

	/**
	 * to: str (playerId)
	 * cmd: str (command code)
	 * content: <any>
	 *
	 * Will send to specified user, command id "private/<cmd>" with given content
	 */
	socket.on('tell', (params, response) => {
		const roomId = players[clientId].room
		if(!roomId) {
			response({status: 'ko', err: 'You are not a member of any room'})
		} else if(!(params.to in players) || players[params.to].room !== roomId) {
			response({status: 'ko', err: 'Cannot find player \'' + params.to + '\' in room \'' + roomId + '\''})
		} else {
			players[params.to].socket.emit('private/' + params.cmd, clientId, params.content)
			response({status: 'ok'})
		}
	})

	/**
	 * to: str (role)
	 * cmd: str (command code)
	 * content: <any>
	 *
	 * Will send to all users having the 'to' role in the room, command id "<to>/<cmd>" with given content
	 */
	socket.on('comm', (params, response) => {
		const roomId = players[clientId].room
		if(!roomId) {
			response({status: 'ko', err: 'You are not a member of any room'})
		} else if(!(params.to === 'host' || params.to === 'all' || params.to in rooms[roomId].roles)) {
			response({status: 'ko', err: 'Role \'' + params.to + '\' does not exists'})
		} else {
			io.to(roomId + '/' + params.to).emit(params.to + '/' + params.cmd, clientId, params.content)
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 *
	 * Get information about a room
	 */
	socket.on('info', (params, response) => {
		if(!params.room || !ROOM_CODE_REGEXP.test(params.room)) {
			response({status: 'ko', err: 'Wrong room id \'' + params.room + '\''})
		} else if(params.room in rooms) {
			response({status: 'ok', room: getRoomDescription(params.room)})
		} else {
			response({status: 'ok', room: null})
		}
	})
}

// ///////////////////
// // Functions // //

function getPlayerRoles(roomId, clientId) {
	if(players[clientId].room !== roomId) {
		return []
	}

	const room = rooms[roomId]
	const roles = Object.entries(room.roles).filter((kv) => kv[1].indexOf(clientId) >= 0).map((kv) => kv[0])
	roles.unshift('all')
	if(room.host === clientId) roles.unshift('host')
	return roles
}

function addPlayerRoles(roomId, clientId, addRoles) {
	const room = rooms[roomId]
	const roles = room.roles
	const player = players[clientId]
	for(const r of addRoles) {
		if(r === 'all') {
			player.room = roomId
			player.socket.join(roomId + '/all')
		} else if(r === 'host') {
			if(room.host) rmPlayerRoles(roomId, room.host, ['host'])
			room.host = clientId
			player.socket.join(roomId + '/host')
		} else if(!(r in roles)) {
			roles[r] = [clientId]
			player.socket.join(roomId + '/' + r)
		} else if(roles[r].indexOf(clientId) < 0) {
			roles[r].push(clientId)
			player.socket.join(roomId + '/' + r)
		}
	}
	return getPlayerRoles(roomId, clientId)
}
function rmPlayerRoles(roomId, clientId, rmRoles) {
	const room = rooms[roomId]
	const roles = room.roles
	const player = players[clientId]
	for(const r of rmRoles) {
		if(r === 'all') {
			delete player.room
			player.socket.leave(roomId + '/all')
		} else if(r === 'host' && room.host === clientId) {
			room.host = null
			player.socket.leave(roomId + '/host')
		} else if(r in roles && roles[r].indexOf(clientId) >= 0) {
			const index = roles[r].indexOf(clientId)
			const moved = roles[r].pop()
			if(index < roles[r].length) {
				roles[r][index] = moved
			} else if(roles[r].length <= 0) {
				delete roles[r]
			}
			player.socket.leave(roomId + '/' + r)
		}
	}
	return getPlayerRoles(roomId, clientId)
}
function rmPlayerFromRoom(roomId, clientId) {
	const roles = getPlayerRoles(roomId, clientId)
	rmPlayerRoles(roomId, clientId, roles)
	delete players[clientId].room

	io.to(roomId + '/all').emit('disconnected', null, {player: clientId, room: getRoomDescription(roomId)})
}
function getRoomHost(roomId) {
	const room = rooms[roomId]
	if(!room.host) {
		for(const p in players) {
			if(players[p].room === roomId) {
				addPlayerRoles(roomId, p, ['host'])
				return p
			}
		}
	}

	return room.host
}

function getRoomDescription(roomId) {
	const desc = {
		room: roomId,
		host: getRoomHost(roomId),
		players: {},
	}
	for(const p in players) {
		if(players[p].room === roomId) {
			desc.players[p] = getPlayerRoles(roomId, p)
		}
	}
	return desc
}

// Starting the server
serverStart()
