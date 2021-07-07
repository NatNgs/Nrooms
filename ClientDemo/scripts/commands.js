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
		// TODO
	})

	/**
	 * room (room where the player has been disconnected)
	 * player: str (id of the player)
	 * roles: [role1, ...] (roles of the player)
	 */
	$.socket.on('disconnected', (data) => {
		// TODO
	})


	// // // Game specific commands

	$.socket.on('all/msg', (data) => {
		console.log('Received message: ' + data.msg)
	})
}
$(document).ready(init)

// socket.emit('cmd', data) to send a command to server

function connectToRoom(roomId) {
	$.socket.emit('join', {
		room: roomId
	}, (confirmation) => {
		console.log('Joined ' + roomId, confirmation)
	})
}


