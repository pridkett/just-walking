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

/**
 * Data types needed for the CSV file with walking distances.
 *
 * Google Sheets doesn't have an option for automatically publishing as a JSON
 * file. The CSV works fairly well, but there's no typing associated with the
 * fields in the CSV. This maps the header columns to their data types for the
 * Google Sheets CSV export.
 * @type {!Object.<string, function>}
 */
const columnDataTypes = {
  'Date': function (x) { return new Date(x) },
  'Steps': function (x) { return parseInt(x) },
  'Miles': function (x) { return parseFloat(x) },
  'Walking Time': function (x) { return parseFloat(x) },
  'Total Steps': function (x) { return parseInt(x) },
  'Total Miles': function (x) { return parseFloat(x) },
  'Total Walking Time': function (x) { return parseFloat(x) }
}

// Styles for the polylines showing the path.
// these are defined because of issues with figlet and className
/**
 * The default style for the line when the mouse is not hovering
 * @type {!Object.<string, (string|number)>}
 */
const defaultPolylineStyle = { color: '#3388ff', opacity: 1, weight: 3 }
/**
 * The style applied to lines during a mouse hover.
 * @type {!Object.<string, (string|number)>}
 */
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
 * Parse and plot the coordinates
 *
 * This uses lazy parsing of the coordinates because the path might be very
 * long, and not evaluating those records ahead of time reduces computation
 * slightly.
 *
 * @param {Array.<string>} coordinates an unparsed array of JSON records that
 *   represent the map to be plotted
 * @param {Array.<{Date: Date, Steps: number, Miles: number, 'Total Steps': number, 'Total Miles': number}>} spreadsheet line split CSV of the walking progress
 *   CSV
 */
function parseCoordinates (coordinates, spreadsheet) {
  /** @type {Array.<number>} */
  const first = JSON.parse(coordinates[0])
  /** @type {Array.<number>} */
  let lastPoint = [0, 0]
  /** @type {number} */
  let coordIdx = 0

  showMap(first['start'][0], first['start'][1])

  /** @type {{start: Array.<number>, stop: Array.<number>, distance: number, total: number}} */
  let coord = JSON.parse(coordinates[coordIdx])
  // iterate over each day's results in the spreadsheet
  for (let rowIdx = 0; rowIdx < spreadsheet.length; rowIdx++) {
    /** @type {Array.<Array.<number>>} */
    let polygonCoords = [coord['start']]

    // The `done` variable is used to avoid accidentally skipping the last
    // bit of the final segement by checking coordIdx === coordinates.length - 1
    // later on in the loop
    let done = false
    while (coord['total'] < spreadsheet[rowIdx]['Total Miles']) {
      polygonCoords.push(coord['stop'])
      if (coordIdx === coordinates.length - 1) {
        lastPoint = coord['stop']
        done = true
        break
      }
      coord = JSON.parse(coordinates[++coordIdx])
    }

    if (!done) {
      // add the stub of what is left
      const fractionalDistance = (spreadsheet[rowIdx]['Total Miles'] - coord['total'] + coord['distance']) / coord['distance']

      // apply a simple linear scaling for the distance on the current point
      const lastPointLat = (coord['stop'][0] - coord['start'][0]) * fractionalDistance + coord['start'][0]
      const lastPointLong = (coord['stop'][1] - coord['start'][1]) * fractionalDistance + coord['start'][1]
      const lastPointDistance = coord['distance'] * (1 - fractionalDistance)

      coord['start'] = [lastPointLat, lastPointLong]
      coord['distance'] = lastPointDistance
      lastPoint = coord['stop']
      // add the last stub onto the polyline - this is the same as the new first
      // point of the line segment that wasn't completed
      polygonCoords.push(coord['start'])
    }

    // draw the polyline
    const tooltip = `<b>${spreadsheet[rowIdx]['Miles']}</b> miles on <b>${spreadsheet[rowIdx]['Date'].toLocaleDateString()}</b>`
    const polyline = L.polyline(polygonCoords, defaultPolylineStyle).bindTooltip(tooltip).addTo(myMap)
    polyline.on('mouseover', function (e) {
      const layer = e.target
      layer.setStyle(highlightPolylineStyle)
    })

    polyline.on('mouseout', function (e) {
      const layer = e.target
      layer.setStyle(defaultPolylineStyle)
    })

    // stop trying to iterate if we're at the end of the list
    if (done) {
      break
    }
  }
  myMap.setView([lastPoint[0], lastPoint[1]], 10)
}

/**
 * Converts the CSV from a string into an array of objects
 *
 * In addition to splitting the CSV into lines and parsing each line into an
 * object, this makes use of {@link columnDataTypes} to assign the appropriate
 * data type to each of the columns in the CSV
 *
 * @param {string} spreadsheet the CSV spreadsheet as a string
 * @return {Array.<{Date: Date, Steps: number, Miles: number, 'Total Steps': number, 'Total Miles': number}>}
 */
function parseCSV (spreadsheet) {
  /** @type {Array.<string>} */
  const spreadsheetLines = spreadsheet.split('\n')
  /** @type {Array.<string>} */
  const columnNames = spreadsheetLines.shift().split(',').map(x => x.trim())
  /** @type {Array.<{Date: Date, Steps: number, Miles: number, 'Total Steps': number, 'Total Miles': number}>} */
  let parsedCSV = []
  for (const row of spreadsheetLines) {
    /** @type {Array.<string>} */
    const thisRow = row.split(',').map(x => x.trim())
    /** @type {{Date: Date, Steps: number, Miles: number, 'Total Steps': number, 'Total Miles': number}} */
    let rowObj = { Date: null, Steps: null, Miles: null, 'Total Steps': null, 'Total Miles': null }
    for (const [idx, key] of columnNames.entries()) {
      if (key in columnDataTypes) {
        rowObj[key] = columnDataTypes[key](thisRow[idx])
      }
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
  ]).then(data => parseCoordinates(data[0].split('\n'), data[1]))
} catch (error) {
  console.log(error)
  throw error
}
