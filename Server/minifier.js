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

const notMinified = []

module.exports = {
	setDebug: (isDebug) => debugMode = isDebug,
	getFileAsync: (originalFilePath, minifiedFilePath, cbSuccess, cbError) => {
		originalFilePath = path.join(projectBase, originalFilePath)

		if(debugMode || /\.min\./.test(originalFilePath) || notMinified.indexOf(originalFilePath) >= 0) {
			return cbSuccess(originalFilePath)
		}

		minifiedFilePath = path.join(projectBase, tmpFolder, minifiedFilePath)
		// look for file in tmp folder
		fs.readFile(minifiedFilePath, (err, minifiedFileContent) => {
			if(minifiedFileContent) {
				return cbSuccess(minifiedFilePath)
			}

			fs.mkdir(path.dirname(minifiedFilePath), { recursive: true }, () => {
				minify(originalFilePath, minifySettings).then((minifiedFileContent) => {
					fs.writeFile(minifiedFilePath, minifiedFileContent, (err) => {
						if(err) {
							notMinified.push(originalFilePath)
							cbSuccess(originalFilePath)
						} else {
							cbSuccess(minifiedFilePath)
						}
					})
				}, (err) => {
					notMinified.push(originalFilePath)
					cbSuccess(originalFilePath)
				})
			})
		})
	}
}
