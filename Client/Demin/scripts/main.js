/* global UTILS, Server, Game */

const roomId = UTILS.getRoomFromURL()
var VIEW = function() {
	const SERVER = new Server(roomId)
	const GAME = new Game(this)

	this.resetGrid = function(height, width) {
		const table = $('<table>')
		table.addClass('dmTable')
		for(let y = 0; y < height; y++) {
			const row = $('<tr>')
			for(let x = 0; x < width; x++) {
				const cell = $('<td>?</td>')
				cell.prop('id', 'cell_'+x+'_'+y)
				cell.addClass('dmCell')
				cell.click(() => clickOnCell(x, y))
				row.append(cell)
			}
			table.append(row)
		}

		$('#content').empty().append(table)
	}

	function clickOnCell(x, y) {
		if(GAME.isDiscovered(x,y))
			return
		// y from 0 (top) to height-1 (bottom)
		// x from 0 (left) to width-1 (right)
		SERVER.sendGroup('host', 'try', {
			x: x,
			y: y,
		})
	}

	//
	// Init
	//
	{
		// Interface events
		$('#btn_settings').click(() => {
			showSettings(SERVER)
		})

		// Server events
		SERVER.onReceiveGroup('all', 'settings', (from, data) => {
			console.log(data)
		})

		SERVER.onReceiveGroup('all', 'start', (from, data) => GAME.start(data))

		SERVER.onReceiveGroup('host', 'try', (from, data) => {
			const cells = {}
			const toCheck = [data.x+'_'+data.y]

			while(toCheck.length > 0) {
				const cs = toCheck.shift()
				const css = cs.split('_')
				const c = GAME.getCell(css[0]|0, css[1]|0)
				if(!c) continue
				cells[cs] = c
				if(!c.value) {
					for(let dx=c.x-1; dx<=c.x+1; dx++) for(let dy=c.y-1; dy<=c.y+1; dy++) {
						const s = dx+'_'+dy
						if(!(s in cells) && toCheck.indexOf(s) < 0) {
							toCheck.push(s)
						}
					}
				}
			}

			SERVER.sendPrivate(from, 'discover', cells)
		})

		SERVER.onReceivePrivate('discover', (from, data) => {
			for(const c in data) {
				const cell = $('#cell_'+c)
				if(data[c].mine) {
					cell.text('¤')
				} else if(data[c].value > 0) {
					cell.text(data[c].value)
				} else {
					cell.text(' ')
				}
				GAME.setDiscovered(data[c].x, data[c].y)
				cell.addClass('discovered')
			}
		})

	}
}


function showSettings(SERVER) {
	const seed = $('#seed')
	const height = $('#height')
	const width = $('#width')
	const mines = $('#mines')
	const mp = $('#minePercent')

	const h_min = height.prop('min')|0
	const h_max = height.prop('max')|0
	const w_min = width.prop('min')|0
	const w_max = width.prop('max')|0

	function validateSettings() {
		update()
		SERVER.sendGroup('all', 'settings', {
			width: width.val()|0,
			height: height.val()|0,
			mines: mines.val()|0,
			seed: seed.val(),
		})
	}
	function startGame() {
		update()
		SERVER.sendGroup('all', 'start', {
			width: width.val()|0,
			height: height.val()|0,
			mines: mines.val()|0,
			seed: seed.val()
		})
	}
	function update() {
		let h = height.val()|0
		let w = width.val()|0
		let m = mines.val()|0

		if(h < h_min)
			height.val(h = h_min)
		if(h > h_max)
			height.val(h = h_max)
		if(w < w_min)
			width.val(w = w_min)
		if(w > w_max)
			width.val(w = w_max)
		if(m <= 0)
			mines.val(m = 1)
		if(m >= w*h)
			mines.val(m = (w*h -1))

		mines.prop('max', h*w - 1)
		mp.text(Math.round(100*m/(w*h)) + '%')
	}

	mines.on('change', update)
	height.on('change', update)
	width.on('change', update)
	seed.on('change', update)

	const popup = $('#div_settings')
	popup.dialog({
		title: 'Settings',
		modal: true,
		buttons: {
			'Update': () => {
				validateSettings()
				popup.dialog('close')
			},
			'Start': () => {
				startGame()
				popup.dialog('close')
			},
		}
	})

	update()
}
