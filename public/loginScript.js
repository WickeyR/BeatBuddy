let API_KEY; // Declare API_KEY at the top for global scope

// Fetch the API key from the backend
async function fetchApiKey() {
  try {
    const response = await fetch('/api/env');
    const data = await response.json();
    API_KEY = data.LAST_FM_API_KEY;

    if (!API_KEY) {
      throw new Error('API Key is undefined.');
    }

    console.log('Fetched API Key:', API_KEY);
    return API_KEY;
  } catch (error) {
    console.error('Error fetching API key:', error);
    throw error;
  }
}

/**
 * Grabs the top tracks to use for background images
 * @param {number} [limit=10] - Optional. The number of songs to grab images from
 * @returns {Promise<Array>} An array of added songs
 */
async function getChartTopTracks(limit = 40) {
  console.log('getChartTopTracks called');

  // Holds the top tracks
  let chartingTracks = [];
  let uniqueArtists = new Set(); // Tracks unique artists
  let page = 1;

  try {
    while (chartingTracks.length < limit) {
      const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
        params: {
          method: 'chart.getTopTracks',
          api_key: API_KEY, // Use the fetched API_KEY
          limit: 50,
          page: page,
          format: 'json',
        },
      });

      const chartTrackResults = response.data.tracks?.track || [];
      if (chartTrackResults.length === 0) break; // Stop if no tracks are returned

      for (const track of chartTrackResults) {
        if (!uniqueArtists.has(track.artist.name)) {
          uniqueArtists.add(track.artist.name);

          // Fetch additional track info to get the track image
          const trackInfo = await getTrackImage(track.artist.name, track.name);
          chartingTracks.push(trackInfo);

          if (chartingTracks.length === limit) break; // Stop once we have enough tracks
        }
      }
      page++; // Move to the next page
    }

    return chartingTracks;
  } catch (error) {
    console.error('Error fetching data from Last.fm', error);
    throw error;
  }
}

/**
 * Grabs the image of a song
 * @param {string} [artist]  The name of the artist
 * @param {string} [songTitle]  The name of the song
 */
async function getTrackImage(artist, songTitle) {
  console.log(`getTrackInfo called for artist: ${artist}, song: ${songTitle}`);

  try {
    const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'track.getInfo',
        api_key: API_KEY, // Use the fetched API_KEY
        artist: artist,
        track: songTitle,
        autocorrect: 1,
        format: 'json',
      },
    });

    const trackInfo = response.data.track;
    const extraLargeImage = trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'];

    return {
      imageURL: extraLargeImage || 'No image available',
    };
  } catch (error) {
    console.error('Error fetching track info from Last.fm', error);
    throw error;
  }
}

// Main function to ensure everything runs sequentially
(async () => {
  try {
    await fetchApiKey(); // Fetch API key first
    const tracks = await getChartTopTracks(); // Fetch tracks using the API key
    console.log('Top Tracks with Unique Artists and Extra Large Images:', tracks);

    // Display the images on the page
    const backgroundContainer = document.querySelector('.background-images');
    tracks.forEach((track) => {
      if (track.imageURL !== 'No image available') {
        const img = document.createElement('img');
        img.src = track.imageURL;
        backgroundContainer.appendChild(img);
      }
    });
  } catch (error) {
    console.error('Error in main function:', error);
  }
})();