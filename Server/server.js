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
	io.sockets.on('connection', onConnect)

	// Listing IP and ports available for connexion (LAN)
	console.info('Server open on:')
	Object.values(os.networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family) && console.info('\t' + iface.address + ':' + config.serverPort)
	))
	console.info() // Newline

	server.listen(config.serverPort)
}

const rooms = {} // roomId: {role1: [player1, player2, ...], role2: [player1, player2, ...], ...}
const players = {} // clientId: {socket: <>, rooms: [roomId1, roomId2, ...]}

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
	players[clientId] = {socket: socket, rooms: []}


	console.log('Player', clientId, 'connected from', connectBy)
	socket.on('disconnect', () => {
		console.log('Client', clientId, 'has been disconnected from', connectBy)
		while(players[clientId].rooms.length) {
			const roomId = players[clientId].rooms.pop()
			leaveRoom(roomId, clientId)
		}
		delete players[clientId]
	})

	/**
	 * room: str
	 * type: str
	 */
	socket.on('create', (params, response) => {
		if(!params.room.match(ROOM_CODE_REGEXP)) {
			response({status: 'ko', err: 'Invalid room Id (\'' + params.room + '\' does not respect [A-Za-z0-9_]{4,12})'})
		} else if(params.room in rooms) {
			response({status: 'ko', err: 'Room \'' + params.room + '\' already exists'})
		} else if(!(params.type in config.httpFolders)) {
			response({status: 'ko', err: 'Type of room \'' + params.type + '\' does not exist'})
		} else {
			rooms[params.room] = {activity: params.type, host:[clientId], all:[], admin:[]}
			const roles = addPlayerRoles(params.room, clientId, ['admin', 'all'])
			roles.forEach((role) => socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit('connected', {player: clientId, room: getRoomDescription(params.room)})
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 */
	socket.on('join', (params, response) => {
		if(!(params.room in rooms)) {
			response({status: 'ko', err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) >= 0) {
			response({status: 'ko', err: 'Already joined the room'})
		} else {
			players[clientId].rooms.push(params.room)
			const roles = addPlayerRoles(params.room, clientId, ['all'])
			roles.forEach((role) => socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit('connected', {player: clientId, room: getRoomDescription(params.room)})
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 */
	socket.on('leave', (params, response) => {
		if(!(params.room in rooms) || players[clientId].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'You are not a member of this room'})
		} else {
			getPlayerRoles(params.room, clientId).forEach((role) => socket.leave(params.room + '/' + role))
			leaveRoom(params.room, clientId)
			response({status: 'ok'})
		}
	})

	/**
	 * player: str
	 * room: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('addRoles', (params, response) => {
		if(!(params.room in rooms) || players[clientId].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'You are not a member of this room'})
		} else if(rooms[params.room].host[0] !== clientId && rooms[params.room].admin.indexOf(clientId) >= 0) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players) || players[params.player].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'Player \'' + params.player + '\' is not in room \'' + params.room + '\''})
		} else {
			const newRoles = addPlayerRoles(params.room, params.player, params.roles)
			newRoles.forEach((role) => players[params.player].socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit('connected', {player: clientId, room: getRoomDescription(params.room)})
			response({status: 'ok'})
		}
	})

	/**
	 * player: str
	 * room: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('rmRoles', (params, response) => {
		if(!(params.room in rooms) || players[clientId].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'You are not a member of this room'})
		} else if(rooms[params.room].host[0] !== clientId && rooms[params.room].admin.indexOf(clientId) >= 0) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players) || players[params.player].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'Player \'' + params.player + '\' is not in room \'' + params.room + '\''})
		} else {
			const pSocket = players[params.player].socket
			getPlayerRoles(params.room, params.player).forEach((role) => pSocket.leave(params.room + '/' + role))
			const newRoles = rmPlayerRoles(params.room, params.player, params.roles)
			newRoles.forEach((role) => pSocket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit('connected', {player: clientId, room: getRoomDescription(params.room)})
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 * to: str (playerId)
	 * cmd: str (command code)
	 * content: <any>
	 *
	 * Will send to specified user, command id "private/<cmd>" with given content
	 */
	socket.on('tell', (params, response) => {
		if(!(params.room in rooms) || players[clientId].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'You are not a member of this room'})
		} else if(!(params.to in players) || players[params.to].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'Cannot find player \'' + params.to + '\' in room \'' + params.room + '\''})
		} else {
			players[params.to].socket.emit('private/' + params.cmd, params.content)
			response({status: 'ok'})
		}
	})

	/**
	 * room: str
	 * to: str (role)
	 * cmd: str (command code)
	 * content: <any>
	 *
	 * Will send to all users having the 'to' role in the room, command id "<to>/<cmd>" with given content
	 */
	socket.on('comm', (params, response) => {
		if(!(params.room in rooms) || players[clientId].rooms.indexOf(params.room) < 0) {
			response({status: 'ko', err: 'You are not a member of room \'' + params.room + '\''})
		} else if(!(params.to in rooms[params.room])) {
			response({status: 'ko', err: 'Role \'' + params.to + '\' does not exists'})
		} else {
			io.to(params.room + '/' + params.to).emit(params.to + '/' + params.cmd, params.content)
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
			response({status: 'ok', room: rooms[params.room]})
		} else {
			response({status: 'ok', room: null})
		}
	})
}

// ///////////////////
// // Functions // //

function leaveRoom(roomId, clientId) {
	rmPlayerRoles(roomId, clientId, getPlayerRoles(roomId, clientId))
	io.to(roomId + '/all').emit('disconnected', {room: roomId, disconnected: clientId})
	const roomRoles = rooms[roomId]

	if(roomRoles.all.length <= 0) { // No more user
		// delete rooms[roomId]
	} else if(roomRoles.host.length <= 0) { // No more host
		let newHost = roomRoles.all[0]
		if(roomRoles.admin.length) {
			newHost = roomRoles.admin[0]
		} else {
			roomRoles.host.push(newHost)
			players[newHost].socket.join(roomId + '/host')
			io.to(roomId + '/all').emit({room: roomId, connected: newHost, roles: getPlayerRoles(roomId, newHost)})
		}
	}
}

function getPlayerRoles(roomId, clientId) {
	return Object.entries(rooms[roomId]).filter((kv) => kv[1].indexOf(clientId) >= 0).map((kv) => kv[0])
}
function addPlayerRoles(roomId, clientId, addRoles) {
	const roles = rooms[roomId]
	for(const r of addRoles) {
		if(r === 'host') continue // "host" role can only be modified by explicitelly modifying this.roles.host
		if(!(r in roles)) {
			roles[r] = [clientId]
		} else if(roles[r].indexOf(clientId) < 0) {
			roles[r].push(clientId)
		}
	}
	return getPlayerRoles(roomId, clientId)
}
function rmPlayerRoles(roomId, clientId, rmRoles) {
	const roles = rooms[roomId]
	for(const r of rmRoles) {
		if(r !== 'host' // "host" role can only be modified by explicitelly modifying this.roles.host
				&& r !== 'all' // can only be removed by leaving the room
				&& r in roles && roles[r].indexOf(clientId) >= 0) {
			const index = roles[r].indexOf(clientId)
			const moved = roles[r].pop()
			if(index < roles[r].length) {
				roles[r][index] = moved
			} else if(roles[r].length <= 0 && r !== 'admin') {
				delete roles[r]
			}
		}
	}
	return getPlayerRoles(roomId, clientId)
}

function getRoomDescription(roomId) {
	const desc = {
		room: roomId,
		players: rooms[roomId]
	}
	return desc
}

// Starting the server
serverStart()
