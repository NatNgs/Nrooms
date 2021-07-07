const fs = require('fs')
const path = require('path')

const minify = require('@node-minify/core')
const minifyHTML = require('html-minifier-terser').minify
const minifyJS = require('@node-minify/google-closure-compiler')
const minifyCSS = require('@node-minify/crass')

const minifyJSSettings = {
	languageIn: 'ES6',
	languageOut: 'ES6',
}

const minifyHTMLSettings = {
	collapseWhitespace: true,
	collapseBooleanAttributes: true, // Omit attribute values from boolean attributes
	decodeEntities: true, // Use direct Unicode characters whenever possible
	html5: true, // Parse input according to HTML5 specifications
	keepClosingSlash: true, // Keep the trailing slash on singleton elements
	quoteCharacter: '"', // Type of quote to use for attribute values (' or ")
	removeAttributeQuotes: true, // Remove quotes around attributes when possible
	minifyJS: true,
	minifyCSS: true,
	minifyURLs: true,
	removeComments: true, // Strip HTML comments
	removeRedundantAttributes: true, // Remove attributes when value matches default.
	removeScriptTypeAttributes: true, // Remove type="text/javascript" from script tags. Other type attribute values are left intact
	removeStyleLinkTypeAttributes: true, // Remove type="text/css" from style and link tags. Other type attribute values are left intact
	useShortDoctype: true, // Replaces the doctype with the short (HTML5) doctype
}

// Path to main folder of the project (to be updated if this file is moved)
const projectBase = path.join(__dirname, '..')

// Prepare cache folder
const tmpFolder = 'tmp'
fs.rmdirSync(tmpFolder, { recursive: true })

const minifiersMap = {
	// Default (will not be minified)
	'': (fileName, cbSuccess, cbError) => {
		const unminifiedPath = path.join(projectBase, fileName)
		if(fs.existsSync(unminifiedPath))
			return cbSuccess(unminifiedPath)
		cbError('File not found ' + unminifiedPath)
	},
	'html': (fileName, cbSuccess, cbError) => {
		const minifiedPath = path.join(projectBase, tmpFolder, fileName)
		fs.readFile(fileName, (err, fileContent) => {
			if (err || !fileContent) {
				return cbError(err)
			}
			fs.mkdir(
				path.dirname(minifiedPath),
				{ recursive: true },
				() => fs.writeFile(
					minifiedPath,
					minifyHTML(
						fileContent.toString(),
						minifyHTMLSettings
					),
					() => cbSuccess(minifiedPath)
				)
			)
		})
	},
	'js': (fileName, cbSuccess, cbError) => {
		const minifiedPath = path.join(projectBase, tmpFolder, fileName)
		fs.mkdirSync(path.dirname(minifiedPath), { recursive: true })
		minify({
			compressor: minifyJS,
			options: minifyJSSettings,
			input: fileName,
			output: minifiedPath,
		}).then(() => cbSuccess(minifiedPath)).catch(cbError)
	},
	'css': (fileName, cbSuccess, cbError) => {
		const minifiedPath = path.join(projectBase, tmpFolder, fileName)
		fs.mkdirSync(path.dirname(minifiedPath), { recursive: true })
		minify({
			compressor: minifyCSS,
			input: fileName,
			output: minifiedPath,
		}).then(() => cbSuccess(minifiedPath)).catch(cbError)
	},
}

let debugMode = false

module.exports = {
	setDebug: (isDebug) => debugMode = isDebug,
	getFileAsync: function(fileName, cbSuccess, cbError) {
		const ext = fileName.slice(fileName.lastIndexOf('.')+1)
		if(fileName.endsWith('.min.' + ext)) {
			return cbSuccess(projectBase + '/' + fileName)
		}
		// look for file in tmp folder
		const tmpFilePath = path.join(tmpFolder, fileName)
		fs.readFile(tmpFilePath, (err, minifiedFileContent) => {
			if(minifiedFileContent) {
				cbSuccess(projectBase + '/' + tmpFilePath)
				return
			}
			let minifier = minifiersMap[ext]
			if(!minifier || debugMode)
				minifier = minifiersMap['']
			else
				console.log('Minifying ' + fileName + ' to ' + tmpFilePath)
			minifier(fileName, cbSuccess, cbError)
		})
	}
}
