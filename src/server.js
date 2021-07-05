const app = require('express')()
const os = require('os')
const server = require('http').Server(app)
const io = require('socket.io').listen(server)
const config = require('./config.json')

function serverStart() {
	io.sockets.on('connection', onConnect)
	server.listen(config.serverPort)

	// Listing IP and ports available for connexion (LAN)
	console.info('Server open on:')
	Object.values(os.networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family) && console.info('\t' + iface.address + ':' + config.serverPort)
	))
	console.info() // Newline
}

// io.emit('cmd', data) // broadcast
// socket.emit('cmd', data) // send command to specific
// io.to('roomName').emit('cmd', data) // send command to every socket in room
// socket.join('roomName') // add socket to room
// socket.leave('roomName') // remove socket from room
const rooms = {} // roomId: {role1: [player1, player2, ...], role2: [player1, player2, ...], ...}
const players = {} // clientId: {socket: <>, rooms: [roomId1, roomId2, ...]}
function onConnect(socket) {
	const connectBy = socket.handshake.headers.host

	const clientId = connectBy // TODO: hide
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
	 */
	socket.on('create', (params, response) => {
		if(!params.room.match(/^[A-Za-z0-9_]{4,12}$/)) {
			response.status(400).emit({err: 'Invalid room Id (\'' + params.room + '\' does not respect [A-Za-z0-9_]{4,12})'})
		} else if(params.room in rooms) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' already exists'})
		} else {
			rooms[params.room] = {host:[], all:[], admin:[]}
			const roles = addPlayerRoles(params.room, clientId, ['admin', 'host', 'all'])
			roles.forEach((role) => socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit({room: params.room, connected: clientId, roles: roles})
			response.status(200).emit()
		}
	})

	/**
	 * room: str
	 */
	socket.on('join', (params, response) => {
		if(!(params.room in rooms)) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) >= 0) {
			response.status(400).emit({err: 'Already joined the room'})
		} else {
			const roles = addPlayerRoles(params.room, clientId, ['all'])
			getPlayerRoles(params.room, clientId).forEach((role) => socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit({room: params.room, connected: clientId, roles: roles})
			response.status(200).emit()
		}
	})

	/**
	 * room: str
	 */
	socket.on('leave', (params, response) => {
		if(!(params.room in rooms)) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) < 0) {
			response.status(403).emit({err: 'You are not a member of this room'})
		} else {
			getPlayerRoles(params.room, clientId).forEach((role) => socket.leave(params.room + '/' + role))
			leaveRoom(params.room, clientId)
			response.status(200).emit()
		}
	})

	/**
	 * player: str
	 * room: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('addRoles', (params, response) => {
		if(!(params.room in rooms)) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) < 0) {
			response.status(403).emit({err: 'You are not a member of this room'})
		} else if(rooms[params.room].host[0] !== clientId && rooms[params.room].admin.indexOf(clientId) >= 0) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players)) {
			response.status(400).emit({err: 'Player \'' + params.player + '\' does not exists'})
		} else if(players[params.player].rooms.indexOf(params.room) < 0) {
			response.status(400).emit({err: 'Player \'' + params.player + '\' is not in room \'' + params.room + '\''})
		} else {
			const newRoles = addPlayerRoles(params.room, params.player, params.roles)
			newRoles.forEach((role) => players[params.player].socket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit({room: params.room, connected: params.player, roles: newRoles})
			response.status(200).emit()
		}
	})

	/**
	 * player: str
	 * room: str
	 * roles: [role1, role2, ...]
	 */
	socket.on('rmRoles', (params, response) => {
		if(!(params.room in rooms)) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) < 0) {
			response.status(403).emit({err: 'You are not a member of this room'})
		} else if(rooms[params.room].host[0] !== clientId && rooms[params.room].admin.indexOf(clientId) >= 0) {
			response.status(401).send({err: 'Admin role required'})
		} else if(!(params.player in players)) {
			response.status(400).emit({err: 'Player \'' + params.player + '\' does not exists'})
		} else if(players[params.player].rooms.indexOf(params.room) < 0) {
			response.status(400).emit({err: 'Player \'' + params.player + '\' is not in room \'' + params.room + '\''})
		} else {
			const pSocket = players[params.player].socket
			getPlayerRoles(params.room, params.player).forEach((role) => pSocket.leave(params.room + '/' + role))
			const newRoles = rmPlayerRoles(params.room, params.player, params.roles)
			newRoles.forEach((role) => pSocket.join(params.room + '/' + role))
			io.to(params.room + '/all').emit({room: params.room, connected: params.player, roles: newRoles})
			response.status(200).emit()
		}
	})

	/**
	 * room: str
	 * to: str (role)
	 * cmd: str (command code) Note: will be prefixed by 'client/'
	 * content: <any>
	 */
	socket.on('comm', (params, response) => {
		if(!(params.room in rooms)) {
			response.status(400).emit({err: 'Room \'' + params.room + '\' does not exists'})
		} else if(players[clientId].rooms.indexOf(params.room) < 0) {
			response.status(403).emit({err: 'You are not a member of this room'})
		} else if(!(params.to in rooms[params.room])) {
			response.status(400).emit({err: 'Role \'' + params.to + '\' does not exists'})
		} else {
			io.to(params.room + '/' + params.to).emit('client/' + params.cmd, params.content)
			response.status(200).emit()
		}
	})
}

// ///////////////////
// // Functions // //

function leaveRoom(roomId, clientId) {
	rmPlayerRoles(roomId, clientId, getPlayerRoles(roomId, clientId))
	io.to(roomId + '/all').emit({room: roomId, disconnected: clientId})
	const roomRoles = rooms[roomId]

	if(roomRoles.all.length <= 0) { // No more user: Room is closed
		delete rooms[roomId]
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

// Starting the server
serverStart()
