/* global UTILS */

var Game = function(VIEW) {
	const params = {}
	const minesList = []
	const discovered = {}

	// HOST
	this.start = function(gameSettings) {
		// Init random
		const rnd = new Math.seedrandom(gameSettings.seed || (''+Math.random()))

		// Init size
		params.width = gameSettings.width
		params.height = gameSettings.height
		VIEW.resetGrid(params.height, params.width)

		// Init mines
		minesList.length = 0
		while(minesList.length < gameSettings.mines) {
			const x = (rnd()*params.width)|0
			const y = (rnd()*params.height)|0
			const xy = toCoord(x, y)
			if(minesList.indexOf(xy) < 0) {
				minesList.push(xy)
			}
		}

		// Reset discovered cells
		for(const key in Object.keys(discovered)) {
			delete discovered[key]
		}
	}

	this.getCell = function(x, y) {
		if(x < 0 || y < 0 || x >= params.width || y >= params.height) return null

		const isMine = minesList.indexOf(toCoord(x, y)) >= 0
		let v = 0
		for(let dx=x-1; dx<=x+1; dx++) {
			if(dx < 0 || dx >= params.width) continue
			for(let dy=y-1; dy<=y+1; dy++) {
				if(dy >= 0 && dy < params.height)
					v+= (minesList.indexOf(toCoord(dx,dy)) >= 0) ? 1 : 0
			}
		}

		return {
			x: x,
			y: y,
			mine: isMine,
			value: v
		}
	}

	// PLAYER - Discovered
	this.setDiscovered = function(x,y) {
		discovered[toCoord(x,y)] = true
	}
	this.isDiscovered = function(x,y) {
		return !!discovered[toCoord(x,y)]
	}
}

function toCoord(x, y) {
	return (x+y)*(x+y+1)/2+x
}
function fromCoord(c) {
	const s = (Math.sqrt(8*c+1)-1)>>1
	const x = -(s*s+s-2*c)>>1
	return {x:x, y:s-x}
}
