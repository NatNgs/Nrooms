
var UTILS = new function() {
	this.getRoomFromURL = function() {
		return window.location.pathname.split('/')[1]
	}
}
