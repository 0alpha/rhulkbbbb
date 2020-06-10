const superagent = require('superagent');
const async = require('async')
const fs = require('fs')
const _ = require('lodash')
const Enmap = require("enmap");
const shipGenerator = require(`${__dirname}/../utility/shipGenerator`)
const cron = require('cron')
const plotly = require('plotly')('Shadow_Storm419', 'TxSRgxqeDWdxtwTxzt2H')

const graph = new Enmap({
  name: "graph"
});

const userDataApi = 'https://api.worldofwarships.com/wows/ships/stats/'
const expectedPrApi = 'https://api.wows-numbers.com/personal/rating/expected/json/'
const apikey = '3e2c393d58645e4e4edb5c4033c56bd8'
const id = 1023637668


class ShipStats {
  constructor(games_list, all_stats, last_battle_time) {
    this.games_list = games_list
    this.all_stats = all_stats
    this.last_battle_time = last_battle_time
  }

  getGames() {
    return this.games_list
  }

  getlast_battle_time() {
    return this.last_battle_time
  }

  updateStats(updated_stats, last_battle_time) {
    var newStatBlock = {
      damage_dealt: updated_stats.damage_dealt - this.all_stats.damage_dealt,
      wins: updated_stats.wins - this.all_stats.wins,
      frags: updated_stats.frags - this.all_stats.frags,
      battles: updated_stats.battles - this.all_stats.battles
    }
    this.all_stats = updated_stats
    this.games_list.push(newStatBlock)
    this.last_battle_time = last_battle_time
  }

  async getPRGraph(ship_id) {
    var graph = [{
      x: [],
      y: [],
      type: 'scatter'
    }]
    var point = {
      damage_dealt: 0,
      wins: 0,
      frags: 0,
      battles: 0
    }
    for (var i = 0; i < this.games_list.length; i++) {
      point.damage_dealt += this.games_list[i].damage_dealt
      point.wins += this.games_list[i].wins
      point.frags += this.games_list[i].frags
      point.battles += this.games_list[i].battles
      let pr = await generatePR(point, ship_id)
      graph[0].x.push(point.battles)
      graph[0].y.push(pr)
    }
    return graph
  }

  getWRGraph() {
    var graph = [{
      x: [],
      y: [],
      type: 'scatter'
    }]
    for (var i = 0; i < this.games_list.length; i++) {
      point.wins += this.games_list[i].wins
      point.battles += this.games_list[i].battles
      let wr = point.wins / point.battles
      graph[0].x.push(point.battles)
      graph[0].y.push(wr)
    }
    return graph
  }

  static cast(object) {
    return new ShipStats(object.games_list, object.all_stats, object.last_battle_time)
  }
}

function updateHandler() {
  const userId = [id]
  for (var i = 0; i < userId.length; i++) {
    update(userId[i])
  }
}

async function update(playerid) {

  let prevStats = await graph.get(playerid)

  let updated_stats = await superagent.get(userDataApi).query({
    application_id: apikey,
    account_id: playerid,
    fields: 'last_battle_time, ship_id, pvp.battles, pvp.damage_dealt, pvp.wins, pvp.frags'
  })

  updated_stats = updated_stats.body.data[playerid]

  // let testData = fs.readFileSync(`${__dirname}/../playerData/1023637668.json`)
  //
  // let updaed = JSON.parse(testData)

  let stats

  for (var i = 0; i < updated_stats.length; i++) {
    if (prevStats[updated_stats[i].ship_id].last_battle_time < updated_stats[i].last_battle_time) {
      let prevShipStats = graph.get(playerid, updated_stats[i].ship_id)
      prevShipStats = ShipStats.cast(prevShipStats)
      if (!prevShipStats) {
        graph.set(playerid, new ShipStats([updated_stats[i].pvp], updated_stats[i].pvp, updated_stats[i].last_battle_time),
          updated_stats[i].ship_id)
        continue
      }
      prevShipStats.updateStats(updated_stats[i].pvp, updated_stats[i].last_battle_time)
      graph.set(playerid, prevShipStats, updated_stats[i].ship_id)
    }
  }

  // for (var i = 0; i < updated_stats.length; i++) {
  //   if (prevStats[updated_stats[i].ship_id].getlast_battle_time() < updated_stats[i].last_battle_time) {
  //     stats = new ShipStats(prevStats[shipTimeList[i].ship_id), shipTimeList[i].pvp)
  //     stats.updateStats(updated[i].pvp, updated[i].last_battle_time)
  //   }
  // }

}

// test()

async function generatePR(data, ship_id) {
  let ship_expected_values = graph.get('expected_values', ship_id)

  let rWins = (data.wins / data.battles) / (ship_expected_values.win_rate / 100)
  let rFrags = (data.frags / data.battles) / ship_expected_values.average_frags
  let rDmg = data.damage_dealt / data.battles / ship_expected_values.average_damage_dealt

  let nDmg = Math.max(0, (rDmg - 0.4) / (1 - 0.4))
  let nFrags = Math.max(0, (rFrags - 0.1) / (1 - 0.1))
  let nWins = Math.max(0, (rWins - 0.7) / (1 - 0.7))

  let PR = 700 * nDmg + 300 * nFrags + 150 * nWins

  return Math.round(PR)
}



async function init(playerid) {

  graph.clear()

  await shipGenerator.shipGenerator()

  let expected_values = await superagent.get(expectedPrApi)
  expected_values = expected_values.body.data

  graph.set('expected_values', expected_values)

  let playerstats = await superagent.get(userDataApi).query({
    application_id: apikey,
    account_id: playerid,
    fields: 'last_battle_time, ship_id, pvp.battles, pvp.damage_dealt, pvp.wins, pvp.frags'
  })

  playerstats = playerstats.body.data[playerid]

  // test data
  // let testData = fs.readFileSync(`${__dirname}/../playerData/1023637668.json`)
  // let playerstats = JSON.parse(testData)

  for (var i = 0; i < playerstats.length; i++) {
    graph.set(playerid, new ShipStats([playerstats[i].pvp], playerstats[i].pvp, playerstats[i].last_battle_time),
      playerstats[i].ship_id)
  }
  // console.log(graph);
}

async function sendGraph(player_id = id, ship_id = '4182685136', isPR = true) {
  let trace
  if (isPR) {
    trace = await (ShipStats.cast(graph.get(id, ship_id))).getPRGraph(ship_id)
  } else {
    trace = await (ShipStats.cast(graph.get(id, ship_id))).getWRGraph(ship_id)
  }
  // console.log(graph.get('ship_id'));
  var layout = {
    title: `${graph.get('ship_id')[ship_id]}`,
    xaxis: {
      dtick: 1,
    }
  }

  let figure = {
    'data': trace,
    layout: layout
  }

  let imgOpts = {
    format: 'png',
  }

  plotly.getImage(figure, imgOpts, function(error, imageStream) {
    if (error) return console.log(error)

    let fileStream = fs.createWriteStream('./cmds/graphs/graph.png')
    imageStream.pipe(fileStream)
  })
}


async function main() {
  // await init(id)
  // await update(id)
  // await test()
  // const job = cron.job('*/20 * * * *', () => updateHandler())
  // job.start()
  // sendGraph()
}

// main()

module.exports.graph = sendGraph







async function test() {
  let test = await (ShipStats.cast(graph.get(id, '4076746192'))).getPRGraph(4076746192)
  console.log(test)

  // let memberRequest = await superagent.get(userDataApi).query({
  //   application_id: apikey,
  //   account_id: playerid,
  //   fields: 'last_battle_time, ship_id, pvp.battles, pvp.damage_dealt, pvp.wins, pvp.frags'
  // })
  //
  // var updated = memberRequest.body.data[playerid]
  //
  // let shipTimeList = JSON.parse(fs.readFileSync(`${__dirname}/../playerData/${playerid}.json`))
  //
  // for (var i = 0; i < updated.length; i++) {
  //   if (Math.floor(Date.now() / 1000) - updated[i].last_battle_time < 1200) {
  //     let prevStats = playerData.get(shipTimeList[i].ship_id)
  //     let newStats = updated[i].pvp
  //     console.log(prevStats)
  //     if (prevStats) {
  //       let lastGame = {
  //         damage_dealt: newStats.damage_dealt - prevStats.damage_dealt,
  //         wins: newStats.wins - prevStats.wins,
  //         frags: newStats.frags - prevStats.frags,
  //         battles: newStats.battles - prevStats.battles
  //       }
  //     } else {
  //       let lastGame = newStats
  //     }
  //     console.log(lastGame);
  // let updated_stats = playerData.get(shipTimeList[i].ship_id)
  // updated_stats.push(lastGame)
  // playerData.set(shipTimeList[i].ship_id, updated_stats)

  // playerData.set(shipTimeList[i].ship_id,
  // console.log(map.get(shipTimeList[i].ship_id.toString()))
  // console.log(shipTimeList[i].ship_id)
  //   }
  // }
  // console.log(playerData)
}

// init()
// update()
