const fs = require('fs')
const path = require('path')

const minify = require('minify')
const minifySettings = {}

let debugMode = false

// Path to main folder of the project (to be updated if this file is moved)
const projectBase = path.join(__dirname, '..')

// Prepare cache folder
const tmpFolder = 'tmp'
fs.rmdirSync(tmpFolder, { recursive: true })

module.exports = {
	setDebug: (isDebug) => debugMode = isDebug,
	getFileAsync: (originalFilePath, minifiedFilePath, cbSuccess, cbError) => {
		originalFilePath = path.join(projectBase, originalFilePath)
		minifiedFilePath = path.join(projectBase, tmpFolder, minifiedFilePath)
		// look for file in tmp folder
		fs.readFile(minifiedFilePath, (err, minifiedFileContent) => {
			if(debugMode) {
				return cbSuccess(originalFilePath)
			} else if(minifiedFileContent) {
				return cbSuccess(minifiedFilePath)
			}

			console.log('Minifying ' + originalFilePath + '...')
			fs.mkdir(path.dirname(minifiedFilePath), { recursive: true }, () => {
				minify(originalFilePath, minifySettings).then((minifiedFileContent) => {
					console.log('Minified ' + originalFilePath + ' to ' + minifiedFilePath)
					fs.writeFile(minifiedFilePath, minifiedFileContent, (err) => cbSuccess(err?originalFilePath:minifiedFilePath))
				}, (err) => {
					console.log('Cannot minify - Copied ' + originalFilePath + ' to ' + minifiedFilePath)
					fs.readFile(
						originalFilePath,
						(err, originalFileContent) => fs.writeFile(
							minifiedFilePath,
							originalFileContent.toString(),
							(err) => cbSuccess(err?originalFilePath:minifiedFilePath)
						)
					)
				})
			})
		})
	}
}
