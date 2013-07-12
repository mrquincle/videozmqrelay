/**
 * Server that provides a REST API on one side, while it opens up ports to receive ZeroMQ messages on the backend. 
 * The ZeroMQ messages are supposed to be in image format. This thing runs on an Almende server, and cannot run on a 
 * Heroku server because it has to open ZeroMQ sockets to the outside world.
 *
 * Author: D. Egger
 * Author: A.C. van Rossum
 * Copyright: Distributed Organisms B.V.
 * Date: Jun. 28, 2013
 */
var zmq = require('zmq')
var express = require('express')
var videoSubscriber = zmq.socket('sub')

var clientCount = 0
, clients = new Array()

// default port for ZeroMQ
var videoPort		= 4010

var app = module.exports = express();
app.use(express.logger());
var restport = process.env.PORT || 5000;

// check if ports were provided as arguments
process.argv.forEach(function (val, index, array) {
	switch(index) {
	case 2: 
		videoPort = val
		break;
	}
})

// implement format string
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

// ZeroMQ server ------------------------------------------------------------------------------------------------------

// This is node / javascript. No need to use a buffer because there is only one thread anyway. Hence, after a message 
// arrives a REST api call should come in. If not, a new ZeroMQ message will arrive and overwrite the old image. There
// is no need to store it, because if a REST api call arrives, it would want to have the newest image anyway. The old
// one will be immediately obsolete.
var image = {
	// target is (not so unique) nickname
	target: "nobody",
	width: 0,
	height: 0,
	data: []
};

var new_image_flag;

// Video Forwarder -------------------------------------------------
// a video message has 4 fields, target, width, height and data
videoSubscriber.on('message', function(target, width, height, data) {
	image.target = target;
	image.width = width;
	image.height = height;
	image.data = data;
	new_image_flag = true;
})

// subscribe to everything
videoSubscriber.subscribe('')
videoSubscriber.bind('tcp://*:{0}'.format(Number(videoPort)), function(err) {
	if (err)
		console.log(err)
	else
		console.log('Video Listening on {0}'.format(Number(videoPort)))
})

// REST server --------------------------------------------------------------------------------------------------------

// this is the only REST API call that is relevant, it gets an image
app.get('/image', function(req, res) {
	if (new_image_flag === false)
		res.send({ success: false })
	else {
		res.send( image.data )
		new_image_flag = false;
	}
})

app.listen(restport, function() {
  console.log("Listening on " + restport);
})

// Shutdown -----------------------------------------------------------------------------------------------------------
process.on('SIGINT', function() {
	console.log('\nClose ZeroMQ -> REST image server')
	videoSubscriber.close()
})
