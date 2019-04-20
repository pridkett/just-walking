/**
 * walking.js
 *
 * Copyright (c) 2019 Patrick Wagstrom <patrick@wagstrom.net>
 * Licensed under the terms of the MIT License
 *
 * This code handles three different tasks to show my walking map on a web page:
 *
 * 1. It loads the saved route which has already been converted to JSON lines
 * 2. It loads the Google Sheet with my walking progress
 * 3. It uses those two files together with leaflet to create the map
 *
 * It's been a long time since I've programmed in JavaScript, this was a nice
 * exercise to see how the language, particular on the browser side, had changed
 * since I last used it. Feel free to send in suggestions on how to make this
 * code more "standard"-ish. The goal is to keep this lightweight and not resort
 * to libraries like jQuery, much less React, Vue, Angular, or whatever the kids
 * are using nowadays.
 */

/* global L, mapboxToken, spreadsheetUrl */

/** @type {!string} */
const pathFilename = 'walkingPath.jsonl'

const myMap = L.map('mapid')

// Data types needed for the CSV file with walking distances
// Google Sheets doesn't have an option for automatically publishing as a JSON
// file. The CSV works fairly well, but there's no typing associated with the
// fields in the CSV. This maps the header columns to their data types for the
// Google Sheets CSV export.
/** @type {!Object<string, function} */
const columnDataTypes = {
  'Date': function (x) { return new Date(x) },
  'Steps': function (x) { return parseInt(x) },
  'Miles': function (x) { return parseFloat(x) },
  'Total Steps': function (x) { return parseInt(x) },
  'Total Miles': function (x) { return parseFloat(x) }
}

// Styles for the polylines showing the path.
// these are defined because of issues with figlet and className
/** @type {!Object<string, string|number} */
const defaultPolylineStyle = { color: '#3388ff', opacity: 1, weight: 3 }
/** @type {!Object<string, string|number} */
const highlightPolylineStyle = { color: 'red', opacity: 1, weight: 5 }

function showMap (latitude, longitude) {
  myMap.setView([latitude, longitude], 13)
  L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.streets',
    accessToken: mapboxToken
  }).addTo(myMap)
}

/**
 * @param {*} text
 *
 * This method borrows a little bit from this StackOverflow post on how to break
 * out of a foreach loop: https://stackoverflow.com/a/2641374/57626
 *
 * TODO: This should break straight line segments in half if they end in the
 * middle of a day.
 */
function parseCoordinates (text, spreadsheet) {
  const coordinates = text.split('\n')
  const first = JSON.parse(coordinates[0])
  let polygonCoords = [first['start']]
  let lastPoint = []
  const BreakException = {}
  let rowIdx = 0

  showMap(first['start'][0], first['start'][1])

  try {
    coordinates.forEach(function (record) {
      const coord = JSON.parse(record)
      polygonCoords.push(coord['stop'])
      lastPoint = coord['stop']
      while (coord['total'] > spreadsheet[rowIdx]['Total Miles']) {
        const tooltipMsp = `<b>${spreadsheet[rowIdx]['Miles']}</b> miles on <b>${spreadsheet[rowIdx]['Date'].toLocaleDateString()}</b>`
        const polyline = L.polyline(polygonCoords, defaultPolylineStyle).bindTooltip(tooltipMsp).addTo(myMap)

        polyline.on('mouseover', function (e) {
          const layer = e.target
          layer.setStyle(highlightPolylineStyle)
        })

        polyline.on('mouseout', function (e) {
          const layer = e.target
          layer.setStyle(defaultPolylineStyle)
        })

        polygonCoords = [coord['stop']]
        rowIdx = rowIdx + 1
        if (rowIdx >= spreadsheet.length) {
          throw BreakException
        }
      }
    })
  } catch (e) {
    if (e !== BreakException) throw e
  }
  myMap.setView([lastPoint[0], lastPoint[1]], 10)
}

function parseCSV (spreadsheet) {
  spreadsheet = spreadsheet.split('\n')
  const columnNames = spreadsheet.shift().split(',').map(x => x.trim())
  let parsedCSV = []
  for (const row of spreadsheet) {
    const thisRow = row.split(',').map(x => x.trim())
    let rowObj = {}
    for (const [idx, key] of columnNames.entries()) {
      rowObj[key] = columnDataTypes[key](thisRow[idx])
    }
    parsedCSV.push(rowObj)
  }
  return parsedCSV
}

try {
  Promise.all([
    window.fetch(pathFilename)
      .then(response => response.text()),
    window.fetch(spreadsheetUrl)
      .then(response => response.text())
      .then(response => parseCSV(response))
  ]).then(data => parseCoordinates(data[0], data[1]))
} catch (error) {
  console.log(error)
  throw error
}
