/* global io */

function init() {
	$.socket = io.connect('/')

	// Server specific commands
	/**
	 * room (room where the player has been connected)
	 * player: str (id of the player)
	 * roles: [role1, ...] (roles of the player)
	 */
	$.socket.on('connected', (data) => {
		console.log('connected', data)
	})

	/**
	 * room (room where the player has been disconnected)
	 * player: str (id of the player)
	 * roles: [role1, ...] (roles of the player)
	 */
	$.socket.on('disconnected', (data) => {
		console.log('disconnected', data)
	})


	// // // Game specific commands

	$.socket.on('*/msg', (data) => {
		console.log('all/msg', data)
	})
}
$(document).ready(init)

// socket.emit('cmd', data) to send a command to server
function createRoom(roomId, roomType, cb) {
	$.socket.emit('create', {
		room: roomId,
		type: roomType
	}, cb)
}
function joinRoom(roomId) {
	$.socket.emit('join', {
		room: roomId
	}, console.log)
}
function leaveRoom(roomId) {
	$.socket.emit('leave', {
		room: roomId
	}, console.log)
}
function sendGroupMsg(room, group, message) {
	$.socket.emit('comm', {
		room: room,
		to: group,
		cmd: 'msg',
		content: {msg: message}
	}, console.log)
}
function sendPrivateMsg(room, playerId, message) {
	$.socket.emit('tell', {
		room: room,
		to: playerId,
		cmd: 'msg',
		content: {msg: message}
	}, console.log)
}

function getRoomInfo() {
	$.socket.emit('info', {}, console.log)
}
