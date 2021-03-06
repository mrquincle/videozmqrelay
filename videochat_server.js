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

var chatvideoSubscriber = zmq.socket('sub')

var videoSubscriber = zmq.socket('sub')
var commandReceiver = zmq.socket('pull'), 
	commandPublisher = zmq.socket('pub')

var eventReceiver = zmq.socket('pull')

var clientCount = 0, clients = new Array()

var videoCount = 0
var commandCount = 0

// default ports for ZeroMQ
var videoPort = process.env.VIDEOPORT || 4000
var commandPort = process.env.COMMANDPORT || 4010
var eventPort = process.env.EVENTPORT || 4020
var chatvideoPort = process.env.CHATVIDEOPORT || 4030

var app = module.exports = express()
app.use(express.bodyParser()) // to parse application/json encoded requests
app.use(express.logger())


// default port for NodeJS server
var restport = process.env.PORT || 5000;

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

/*
 * The chatvideoSubscriber is able to receive ZMQ images over port chatvideoPort. This is the one that is used by the 
 * ZMQ Video Chat on the play store of Google. 
 */

chatvideoSubscriber.subscribe('')
chatvideoSubscriber.bind('tcp://*:{0}'.format(Number(chatvideoPort)), function(err) {
	if (err)
		console.log(err)
	else
		console.log('Chat video listening on {0}'.format(Number(chatvideoPort)))
})

// Video Forwarder -------------------------------------------------
// a video message from the ZMQ Video Chat application has 4 fields, target, width, height and data
chatvideoSubscriber.on('message', function(target, width, height, data) {
	image.target = target
	image.width = width
	image.height = height
	image.data = data
	new_image_flag = true
})

// The videoSubscriber is able to receive ZMQ images over port videoPort

videoSubscriber.subscribe('');
videoSubscriber.bind('tcp://*:{0}'.format(Number(videoPort)), function(err) {
	if (err)
		console.log(err)
	else
		console.log('Video Listening on {0}'.format(Number(videoPort)))
})

// The videoSubscriber is able to receive ZMQ images over port videoPort

videoSubscriber.on('message', function(target, rotation, data) {
	//try {
	videoCount++

	if (!(videoCount % 1000))
		console.log('Video received ', videoCount)

	image.data = data
	new_image_flag = true

		// forward (publish) the received video frame to the subscribed clients
		//videoPublisher.send([target, rotation, data]);

		// serverProcessed();

		// encode the video frame as base64 and publish it
		//videoBase64Publisher.send([target, rotation, data.toString('base64')]);
	// } catch(err) {
	// 	console.log('videoSubscriber', err)
	// }

})

/*
 * The commandReceiver gets commands over ZMQ.
 */

commandReceiver.bind('tcp://*:{0}'.format(Number(commandPort)), function(err) {
	if (err)
		console.log(err)
	else
		console.log('Command Listening on {0}'.format(Number(commandPort)))
})

// Commands received in [target, data] format.

commandReceiver.on('message', function(target, data) {
	try {
		commandCount++
		console.log('Command received ', commandCount, ':', target.toString(), data.toString())

		// forward (publish) the received video frame to the subscribed clients
		commandPublisher.send([target, data])

		// serverProcessed();
	} catch(err) {
		console.log('commandReceiver', err)
	}

})

commandPublisher.bind('tcp://*:{0}'.format(Number(commandPort)+1), function(err) {
	if (err)
		console.log(err)
	else
		console.log('Command Sending on {0}'.format(Number(commandPort)+1))
})

// REST server --------------------------------------------------------------------------------------------------------

// Get an image
app.get('/image', function(req, res) {
	if (new_image_flag === false)
		res.send({ success: false })
	else {
		res.send( image.data )
		new_image_flag = false;
	}
})

// used to be /command:target with send(req.params.target, ..)
app.post('/command', function(req,res) {
	try {
		commandCount++
		console.log('Send command ', commandCount, ':', req.body)
		commandPublisher.send(['', JSON.stringify(req.body)])
		res.send({ success: true })
	} catch(err) {
		console.log('post-command', err)
	}
})

app.post('/simplecommand', function(req,res) {
	try {
		commandCount++
		console.log('Got command ', commandCount, ':', req.body)
		var command = {
			data: req.body,
			header: { 
				id: 171, tid: 0, timestamp: 0, robot_id: "Romo", version: "0.1" 
			}
		}
		console.log('Send command ', commandCount, ':', JSON.stringify(command))
		commandPublisher.send(['', JSON.stringify(command)])
		res.send({ success: true })
	} catch(err) {
		console.log('post-command', err)
	}
})


app.listen(restport, function() {
	console.log("Listening on " + restport)
})


// Shutdown -----------------------------------------------------------------------------------------------------------
process.on('SIGINT', function() {
	console.log('\nClose ZeroMQ -> REST image server')
	videoSubscriber.close()
})
