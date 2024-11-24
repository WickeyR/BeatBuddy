/**
 * Fetch and display top tracks with images
 * @param {number} [limit=10] - Optional. The number of unique tracks to fetch
 */
async function fetchAndDisplayTracks(limit = 10) {
  try {
    // Fetch preprocessed track data (with images) from the backend
    const response = await fetch(`/api/lastfm/tracks?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const tracks = await response.json();
    console.log('Tracks fetched from backend:', tracks);

    // Display the fetched tracks on the page
    const backgroundContainer = document.querySelector('.background-images');
    tracks.forEach((track) => {
      if (track.imageURL !== 'No image available') {
        const img = document.createElement('img');
        img.src = track.imageURL;
        img.alt = `Image for ${track.trackName} by ${track.artistName}`;
        backgroundContainer.appendChild(img);
      } else {
        console.warn(`No image available for track: ${track.trackName} by ${track.artistName}`);
      }
    });
  } catch (error) {
    console.error('Error fetching and displaying tracks:', error);
  }
}

// Initialize and call the function to fetch and display tracks
fetchAndDisplayTracks(30);