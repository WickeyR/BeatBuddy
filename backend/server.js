// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();


// Load environment variables
require('dotenv').config();

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));


// Redirect to login page on root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// -------------------- Last.fm API Proxy -------------------- //
// Add to server.js

// Endpoint to fetch detailed track info with images
app.get('/api/lastfm/tracks', async (req, res) => {
    const { limit = 10 } = req.query;
    const uniqueArtists = new Set();
    const chartingTracks = [];
    let page = 1;
  
    try {
      while (chartingTracks.length < limit) {
        // Fetch the top tracks from Last.fm
        const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
          params: {
            method: 'chart.getTopTracks',
            api_key: process.env.LAST_FM_API_KEY,
            limit: 50,
            page,
            format: 'json',
          },
        });
  
        const tracks = response.data.tracks?.track || [];
        if (tracks.length === 0) break; // Stop if no tracks are returned
  
        for (const track of tracks) {
          if (!uniqueArtists.has(track.artist.name)) {
            uniqueArtists.add(track.artist.name);
  
            // Fetch detailed track info to get the album image
            const trackDetailResponse = await axios.get('http://ws.audioscrobbler.com/2.0/', {
              params: {
                method: 'track.getInfo',
                api_key: process.env.LAST_FM_API_KEY,
                artist: track.artist.name,
                track: track.name,
                autocorrect: 1,
                format: 'json',
              },
            });
  
            const trackInfo = trackDetailResponse.data.track;
            const extraLargeImage = trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'];
  
            chartingTracks.push({
              trackName: track.name,
              artistName: track.artist.name,
              imageURL: extraLargeImage || 'No image available',
            });
  
            if (chartingTracks.length === limit) break; // Stop once we reach the limit
          }
        }
  
        page++; // Move to the next page
      }
  
      // Return the charting tracks with images
      res.json(chartingTracks);
    } catch (error) {
      console.error('Error fetching data from Last.fm:', error.message);
      res.status(500).json({ error: 'Failed to fetch data from Last.fm' });
    }
  });
// ----------------------------------------------------------- //

// Other routes remain the same...

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});