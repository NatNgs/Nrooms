

function onLoad() {
	$('#nroom').val('')
	$('#goJoin').prop('disabled', true)
	$('#goNew button').prop('disabled', true)
}

const antispamTimeout = 1000
let roomInputNextCall = new Date()
function roomInput() {
	const t = new Date()
	if(t.getTime() <= roomInputNextCall.getTime()) {
		return // already triggered
	}
	t.setSeconds(t.getSeconds() + 1)
	roomInputNextCall = t
	setTimeout(roomInput2, antispamTimeout)
}
function roomInput2() {
	const roomId = $('#nroom').val()
	const goJoin = $('#goJoin')
	const goNewButtons = $('#goNew button')
	console.log('Emiting', 'info', {room: roomId})
	$.socket.emit('info', {
		room: roomId
	}, (response) => {
		if(response.status !== 'ok' || !response.room) {
			// Room does not exist
			goJoin.prop('disabled', true)
			goNewButtons.prop('disabled', false)
		} else {
			// Room exists
			goJoin.prop('disabled', false)
			goNewButtons.prop('disabled', true)
		}
	})
}
