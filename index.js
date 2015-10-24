var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var lobby = {};
var liveGames = {};
var playersByGame = {};
var sockets = {};

io.on('connection', function(socket){
  console.log('user connected');
  io.emit('updateLobby', lobby);

  var gamePlayerInfo = false;

  var quitGame = function(playerInfo){
    console.log('a player quit!');
    var quitter = playerInfo.playerName;
    var gameID = playerInfo.gameID;

    if (playersByGame[gameID]) {
      var player0 = playersByGame[gameID][0].playerName;
      var player1 = playersByGame[gameID][1].playerName;

      if (quitter === player0 || quitter === player1) {
        if (quitter === player0) {
          io.to(gameID).emit('gameEnd', player1);
        } else {
          io.to(gameID).emit('gameEnd', player0);
        }
        delete liveGames[gameID];
        delete playersByGame[gameID];
        delete sockets[gameID];
        io.emit('console.log', liveGames);
      }
    } else if (lobby[gameID]) {
      console.log('old lobby game: ', lobby[gameID]);
      var players = lobby[gameID].players;
      var playerNames = players.map(function(player) {
        return player.playerName;
      });
      var playerInd = playerNames.indexOf(quitter);
      if (playerInd !== -1) {
        players.splice(playerInd, 1);
        if (players.length === 0) {
          delete lobby[gameID];
          delete sockets[gameID];
        }
        console.log('new lobby game: ', lobby[gameID]);
        io.emit('updateLobby', lobby);
      }
    }
  };

  socket.on('playerQuit', quitGame);

  socket.on('gameEnter', function(player) {
    console.log('gameEnter received');
    var gameID = player.gameID;
    var playerName = player.playerName;
    gamePlayerInfo = {gameID: gameID, playerName: playerName};
    socket.join(gameID);
    var newGame = player.newGame;
    if (newGame) {
      lobby[gameID] = {players: [], gameType: player.newGame.gameType, isPrivate: player.newGame.isPrivate};
      sockets[gameID] = {};
    }

    var players = lobby[gameID].players;
    sockets[gameID][playerName] = socket;
    players.push(player);
    var gameType = lobby[gameID].gameType;
    var numJoined = players.length;

    if (numJoined === gameSettings[gameType].max) {
      io.emit('gameStart', gameID);
      // call the gameType function passing in player array
      var liveGame = liveGames[gameID] = {};
      var joinedPlayer;
      for (var j = 0; j < numJoined; j++) {
        joinedPlayer = players[j];
        liveGame[joinedPlayer.playerName] = {
          socket: sockets[gameID][joinedPlayer.playerName],
          isTargetOf: [];
        };
      }
      playersByGame[gameID] = players;
      gameSettings[gameType].func(players, sockets[gameID]);
      delete lobby[gameID];
    }
    io.emit('updateLobby', lobby);

  });

  socket.on('disconnect', function() {
    console.log('player disconnected');
    quitGame(gamePlayerInfo);
    socket.removeAllListeners('playerQuit');
    socket.removeAllListeners('gameEnter');
    socket.removeAllListeners('targetAcquiredBy');
    socket.removeAllListeners('disconnect');
  });
});

var SwappingGame = function (players, playerSockets) {
  var gameID = players[0].gameID;
  var targets = {};

  // Only used as helper function for whenTargetAcquired
  var setUpTargetAcquiredListener = function(playerName, callback) {
    playerSockets[playerName].on('targetAcquiredBy', function() { //playerInfo not needed?
      var targetName = getTargetOf(playerName);
      callback(playerName, targetName);
    });
  }

  // callback(playerName, targetName)
  var whenTargetAcquired = function(playerName_s_, callback) {
    if (typeof playerName_s_ === 'string') {
      playerName_s_ = [playerName_s_];
    }

    if (Array.isArray(playerName_s_)) {
      var numPlayers = playerName_s_.length;
      var playerName;
      for (var ind = 0; ind < numPlayers; ind++) {
        setUpTargetAcquiredListener(playerName_s_[ind], callback);
      }
    }
  };

  var getTargetOf = function(playerName) {
    return liveGames[gameID][playerName].target;
  };

  var assignNewTarget = function(playerName, targetName) {
    var oldTarget = liveGames[gameID][liveGames[gameID][playerName].target];
    if (oldTarget) {
      var ind = oldTarget.isTargetOf.indexOf(playerName);
      if (ind !== -1) {
        oldTarget.isTargetOf.splice(ind, 1);
      }
    }

    liveGames[gameID][playerName].target = targetName;
    liveGames[gameID][targetName].isTargetOf.push(playerName);
    // emit newTarget
  };

  var playerOut = function(playerName) {
    if (typeof playerName === 'object') {
      playerName = playerName.playerName;
    }
    //
  };

  var setCurrentLocationAsHome = function(playerName) {
    // Needs to be the first thing that runs when game starts
  };

  var isTargeting = function(targetName) {
    return liveGames[gameID][targetName].isTargetOf;
  };

  var playerWins = function(playerName) {
    if (typeof playerName === 'string') {
      gameEnd(playerName);
    }
  };

  var gameOver = function() {
    gameEnd('No one');
  };

  var setUpPlayerQuitListener = function(playerName) {
    playerSockets[playerName].on('playerQuit', playerOut);
  };

  // not part of game developer interface
  // only helper function for playerWins and gameOver
  var gameEnd = function(winner) {
    io.to(gameID).emit('gameEnd', winner);
  };

  for (var i = 0; i < players.length; i++) {
    playerSockets[players[i].playerName].on('targetAcquiredBy', function(playerInfo){
      var winner = playerInfo.playerName;
      var gameID = playerInfo.gameID;
      var player0 = playersByGame[gameID][0].playerName;
      var player1 = playersByGame[gameID][1].playerName;

      if (winner === player0 || winner === player1) {
        io.to(gameID).emit('gameEnd', winner);
        delete liveGames[gameID];
        delete playersByGame[gameID];
        delete sockets[gameID];
        //io.emit('console.log', liveGames);
      }
    });
  }

  targets[players[0].playerName] = players[1];
  targets[players[1].playerName] = players[0];
  io.to(gameID).emit('newTarget', targets);
};

var gameSettings = {
  SwappingGame: {name: 'Swap', func: SwappingGame, min: 2, max: 2}
};

http.listen(port, function(){
  console.log('listening on *:'+port);
});
