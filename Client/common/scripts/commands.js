/* global io */

function Server(room = null) {
	let socket
	const defaultCb = (to,cmd,params, out) => console.info('Sent', to, cmd, params, out)

	this.onReceivePrivate = function(cmd, fc) {
		this.onReceiveGroup('private', cmd, fc)
	}
	this.onReceiveGroup = function(group, cmd, fc) {
		this.onReceive((group||'*') + '/' + (cmd||'*'), fc)
	}

	this.onReceive = function(cmd, fc) {
		console.log('Receiver registered for', cmd)
		socket.on(cmd, (...args) => {
			console.info('Received', cmd, args)
			fc(...args)
		})
	}

	//
	// Send commands
	//
	this.send = function(cmd, parameters, cb) {
		socket.emit(cmd, parameters, cb||((out) => defaultCb(null, cmd, parameters, out)))
	}
	this.sendGroup = function(group, cmd, parameters, cb) {
		socket.emit('comm', {
			room: room,
			to: group,
			cmd: cmd,
			content: parameters
		}, cb||((out) => defaultCb(group, cmd, parameters, out)))
	}
	this.sendPrivate = function(uid, cmd, parameters, cb) {
		socket.emit('tell', {
			room: room,
			to: uid,
			cmd: cmd,
			content: parameters
		}, cb||((out) => defaultCb(uid, cmd, parameters, out)))
	}

	//
	// Initialize
	//
	{
		socket = io.connect('/')
		if(room) {
			console.log('Joining room ' + room)
			this.send('join', {room: room}, console.log)
		}
	}
}

