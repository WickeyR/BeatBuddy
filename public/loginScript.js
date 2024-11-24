//last.fm api key here 


/**
 * Grabs the top tracks to use for background images
 * @param {number} [limit=10] - Optional. The number of songs to grab images from
 * @returns {Promise<Array>} An array of added songs
 */
async function getChartTopTracks(limit = 40) {
  console.log('getChartTopTracks called');

  //Holds the top tracks 
  let chartingTracks = [];

  //A hash-set to keep track of unique tracks 
  let uniqueArtists = new Set();
  
  //The current page of the api result
  let page = 1;

  try {
    //Makes the api call to return the top tracks 
    while (chartingTracks.length < limit) {
      const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
        params: {
          method: 'chart.getTopTracks',
          api_key: API_KEY,
          limit: 50, // Fetch 50 tracks per page
          page: page, // Use pagination to request different batches
          format: 'json',
        },
      });
    
      //Sets the array equal to the result, or an aempty array
      const chartTrackResults = response.data.tracks?.track || [];

      //Breaks the loop if the result is empty 
      if (chartTrackResults.length === 0) break; 

      //Loop through every track of the result 
      for (const track of chartTrackResults) {

        // Check if we've already added a track from this artist
        if (!uniqueArtists.has(track.artist.name)) {

          // Add the artist to the set to ensure uniqueness
          uniqueArtists.add(track.artist.name);

          // Fetch additional track info inorder to get track image 
          const trackInfo = await getTrackImage(track.artist.name, track.name);

          //Pushes the information into the array
          chartingTracks.push(trackInfo);

          // Stop once we have the desired number of unique tracks
          if (chartingTracks.length === limit) break;
        }
      }

      // Move to the next page for the next batch of 50 tracks if necessary
      page++; 
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
    //Makes the api call 
    const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'track.getInfo',
        api_key: API_KEY,
        artist: artist,
        track: songTitle,
        autocorrect: 1,
        format: 'json',
      },
    });

    const trackInfo = response.data.track;

    // Find the extra-large image URL (Can change to  small, medium, large, extralarge)
    const extraLargeImage = trackInfo.album?.image.find((img) => img.size === 'extralarge')?.['#text'];

    return {
      imageURL: extraLargeImage || 'No image available',
    };
  } catch (error) {
    console.error('Error fetching track info from Last.fm', error);
    throw error;
  }
}

// This function displays the images onto the html document 
(async () => {
  const tracks = await getChartTopTracks();
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
})();
