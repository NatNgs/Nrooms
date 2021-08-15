/* global Server */

var SERVER = null

function onLoad() {
	SERVER = new Server()
	$('#nroom').val('')
	$('#goJoin').prop('disabled', true)
	$('#goNew button').prop('disabled', true)
}

const ROOM_CODE_REGEXP = /^[A-Z0-9-]{4,12}$/
const antispamTimeout = 1000
let roomInputNextCall = new Date()
function roomInput() {
	const input = $('#nroom')

	// Autoformat
	input.val(input.val().toUpperCase().replace(/[^A-Z0-9-]/g, '')) // To change if ROOM_CODE_REGEXP change

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

	if(!ROOM_CODE_REGEXP.test(roomId))
		return

	const goJoin = $('#goJoin')
	const goNewButtons = $('#goNew button')
	console.log('Emiting', 'info', {room: roomId})
	SERVER.send('info', {
		room: roomId
	}, (response) => {
		if(response.status !== 'ok' || !response.room) {
			// Room does not exist
			goJoin.prop('disabled', true)
			goJoin.off('click')
			goNewButtons.prop('disabled', false)
		} else {
			// Room exists
			goJoin.prop('disabled', false)
			goJoin.click(() => window.location.assign(window.location + roomId))
			goNewButtons.prop('disabled', true)
		}
	})
}

function goNew(type) {
	const roomId = $('#nroom').val()
	SERVER.send('create', {
		room: roomId,
		type: type
	}, (status, err) => {
		if(status === 'ko') {
			alert(err)
		}
		window.location.assign(window.location + roomId)
	})
}
