// chatApplicationFunctions.js: Define functions to be used in the main chat application

// Variables to keep track of current conversation
let currentConversationId = null;

// On page load
document.addEventListener('DOMContentLoaded', () => {
  // Fetch user info and initialize UI
  fetchUserInfo();

  // Fetch chat history
  fetchChatHistory();

  // Check Spotify connection status
  checkSpotifyConnection();

  // Close the popup using the top-left close button
  document.getElementById('popup-close-left-button').addEventListener('click', () => {
    document.getElementById('popup-container').classList.add('hidden');
  });

  // Event listener to create a new chat
  document.getElementById('new-chat-button').addEventListener('click', function () {
    createNewConversation();
    fetchChatHistory();
    fetchPlaylist();
  });
  
  // Add event listener for 'Delete All Chats' button
  document.getElementById('delete-all-chats-button').addEventListener('click', function () {
    deleteAllConversations();
  });

  // Event listener for message form submission
  document.getElementById('userinputform').addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage();
    document.getElementById('userinput').value = '';
  });

  // Event listener for Enter key in textarea
  document.getElementById('userinput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
      document.getElementById('userinput').value = '';
    }
  });

  document.getElementById('delete-all-chats-button').addEventListener('click', function () {
    deleteAllConversations();
  });

  // Toggle sidebars on small screens
  document.getElementById('toggle-chat-history').addEventListener('click', function () {
    document.getElementById('chat-history').classList.toggle('visible');
  });

  document.getElementById('toggle-chat-playlist').addEventListener('click', function () {
    document.getElementById('chat-playlist').classList.toggle('visible');
  });
});

// Fetch user info
function fetchUserInfo() {
  fetch('/user', { credentials: 'include' })
    .then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to fetch user');
      }
    })
    .catch((error) => {
      console.error('An error has occurred fetching username:', error);
    });
  createNewConversation(); 
}

// Function to delete all conversations
function deleteAllConversations() {

  if (confirm('Are you sure you want to delete all conversations? This action cannot be undone.')) {
    fetch('/conversations', {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((response) => {
        if (response.ok) {
          // Clear the chat window and history
          currentConversationId = null;
          document.getElementById('upperid').innerHTML = '';
          fetchChatHistory();

          // Create a new conversation
          createNewConversation();
        } else {
          console.error('Failed to delete all conversations');
        }
      })
      .catch((error) => {
        console.error('Error deleting all conversations:', error);
      });
  }
}

// Fetch chat history
function fetchChatHistory() {
  fetch('/conversations', {
    credentials: 'include', // Include cookies
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      return response.json();
    })
    .then((conversations) => {
      const chatHistoryList = document.getElementById('chat-history-list');
      chatHistoryList.innerHTML = ''; // Clear existing list

      conversations.forEach((conversation) => {
        const li = document.createElement('li');
        li.className = 'chat-history-item';

        // Chat title button
        const button = document.createElement('button');
        button.className = 'chat-history-item-button'; 
        button.dataset.conversationId = conversation.conversation_id;

        // Format the display title
        const startTime = new Date(conversation.start_time);
        const relativeTime = timeSince(new Date(startTime));
        button.textContent = conversation.title || `Chat from ${relativeTime}`; 

        // Load conversation on click
        button.addEventListener('click', () => {
          loadConversation(conversation.conversation_id);
        });

        // Create individual delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'chat-history-delete-button';
        deleteButton.innerHTML = '×'; // Delete icon
        deleteButton.dataset.conversationId = conversation.conversation_id;

        // Prevent propagation and delete conversation
        deleteButton.addEventListener('click', (event) => {

           // Prevent click from loading the conversation
          event.stopPropagation();
          deleteConversation(conversation.conversation_id);
        });

        // Append title button and delete button
        li.appendChild(button);
        li.appendChild(deleteButton);
        chatHistoryList.appendChild(li);
      });
    })
    .catch((error) => {
      console.error('Error fetching chat history:', error);
    });
}

// Delete a conversation
function deleteConversation(conversationId) {
  if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
    fetch(`/conversations/${conversationId}`, { 
      method: 'DELETE',
      credentials: 'include',
    })
      .then((response) => {
        if (response.ok) {

          // Refresh chat history
          fetchChatHistory();

          // If the deleted conversation is the current one, clear the chat window
          if (conversationId === currentConversationId) {
            currentConversationId = null;
            document.getElementById('upperid').innerHTML = '';
          }
        } else {
          console.error('Failed to delete conversation');
        }
      })
      .catch((error) => {
        console.error('Error deleting conversation:', error);
      });
  }
}

// Fetch playlist for the current conversation
function fetchPlaylist() {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist`, {
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch playlist');
      }
      return response.json();
    })
    .then((playlist) => {
      renderPlaylist(playlist);
      fetchSuggestions(); // Fetch suggestions after updating playlist
    })
    .catch((error) => {
      console.error('Error fetching playlist:', error);
    });
}


// Render playlist in the UI
function renderPlaylist(playlist) {
  const playlistList = document.getElementById('chat-playlist-list');
  playlistList.innerHTML = ''; // Clear existing items

  playlist.forEach((song) => {
    // Create playlist item container
    const li = document.createElement('li');
    li.className = 'playlist-item';

    // Image element
    const img = document.createElement('img');

    // Default image if none available
    img.src = song.song_large_image_url || 'images/BeatBuddyIcon.png'; 
    img.alt = `${song.song_title} Album Art`;
    img.className = 'song-image';

    // Song details container
    const songDetails = document.createElement('div');
    songDetails.className = 'song-details';

    // Song title
    const songTitle = document.createElement('div');
    songTitle.className = 'song-title';
    songTitle.textContent = song.song_title;

    // Song artist
    const songArtist = document.createElement('div');
    songArtist.className = 'song-artist';
    songArtist.textContent = song.song_artist;

    // Append title and artist to details
    songDetails.appendChild(songTitle);
    songDetails.appendChild(songArtist);

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.innerHTML = '&times;';
    deleteButton.dataset.songId = song.id;
    deleteButton.addEventListener('click', function () {
      deleteSongFromPlaylist(song.id);
    });

    // Assemble the playlist item
    li.appendChild(img);
    li.appendChild(songDetails);
    li.appendChild(deleteButton);

    // Append to playlist list
    playlistList.appendChild(li);
  });
}


// Create a new conversation
function createNewConversation() {
  fetch('/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: null }),
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }
      return response.json();
    })
    .then((conversation) => {
      currentConversationId = conversation.conversation_id;
      // Clear the chat window
      const upperDiv = document.getElementById('upperid');
      upperDiv.innerHTML = '';
      // Refresh chat history
    })
    .catch((error) => {
      console.error('Error creating new conversation:', error);
    });
  fetchChatHistory();
  fetchPlaylist();
}

// Load a conversation
function loadConversation(conversationId) {
  currentConversationId = conversationId;
  fetch(`/conversations/${conversationId}/messages`, { 
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }
      return response.json();
    })
    .then((messages) => {
      // Clear existing messages
      const upperDiv = document.getElementById('upperid');
      upperDiv.innerHTML = '';

      // Render messages
      messages.forEach((message) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        const messageContentDiv = document.createElement('div');
        if (message.sender === 'user') {
          messageContentDiv.className = 'usermessagediv';
          messageContentDiv.innerHTML = `<div class="usermessage">${message.message_content}</div>`;
        } else {
          messageContentDiv.className = 'appmessagediv';
          messageContentDiv.innerHTML = `<div class="appmessage">${message.message_content}</div>`; 
        }
        messageDiv.appendChild(messageContentDiv);
        upperDiv.appendChild(messageDiv);
      });

      // Scroll to bottom
      scroll();

      // Fetch and render the playlist for this conversation
      fetchPlaylist();
    })
    .catch((error) => {
      console.error('Error loading conversation:', error);
    });
}

// Send a message
async function sendMessage() {
  const userinput = document.getElementById('userinput').value.trim();
  const upperdiv = document.getElementById('upperid');

   // Prevent sending empty messages 
  if (!userinput) return;

  // Display user's message
  upperdiv.innerHTML += `
    <div class="message">
      <div class="usermessagediv">
        <div class="usermessage">
          ${userinput}
        </div>
      </div>
    </div>
  `; 
  scroll();

  try {
    const response = await fetch(`/api/messageGPT`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userInput: userinput,
        // Pass the conversation ID
        conversationId: currentConversationId, 
      }),
      credentials: 'include', 
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server Error');
    }

    const data = await response.json();

    // Display AI's response
    upperdiv.innerHTML += `
      <div class="message">
        <div class="appmessagediv">
          <div class="appmessage">
            ${data.response}
          </div>
        </div>
      </div>
    `; 
    scroll();
  } catch (error) {
    console.error('Error:', error);

    upperdiv.innerHTML += `
      <div class="message error">
        <div class="error-message">Error: ${error.message}</div>
      </div>
    `; 
    scroll();
  }

  // Fetch and render the updated playlist
  fetchPlaylist();
}

// Delete a song from the playlist
function deleteSongFromPlaylist(songId) {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist/${songId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
    .then((response) => {
      if (response.ok) {

        // Refresh the playlist and suggestions
        fetchPlaylist();
        fetchSuggestions();
      } else {
        console.error('Failed to delete song from playlist');
      }
    })
    .catch((error) => {
      console.error('Error deleting song from playlist:', error);
    });
}


// Scroll to bottom function
function scroll() {
  var div = document.getElementById('upperid');
  div.scrollTop = div.scrollHeight;
}

// Spotify functions
function connectToSpotify() {
  const width = 600;
  const height = 700;
  const left = window.innerWidth / 2 - width / 2;
  const top = window.innerHeight / 2 - height / 2;
  const authWindow = window.open(
    '/auth/spotify',
    'Spotify Authentication',
    `width=${width},height=${height},top=${top},left=${left}` 
  );

  // Define the message handler
  function handleMessage(event) {
    if (event.origin !== window.location.origin) {
      // Ignore messages from unknown origins
      return;
    }

    if (event.data === 'spotify-auth-success') {
      // Authentication was successful
      // Reload the dashboard page
      window.location.reload();

      // Close the popup window reference
      if (authWindow) {
        authWindow.close();
      }
      // Remove the event listener to prevent multiple triggers
      window.removeEventListener('message', handleMessage);
    }
  }

  // Listen for messages from the popup window
  window.addEventListener('message', handleMessage, false);
}

function exportPlaylist() {
  if (!currentConversationId) return;

  // Show the loading spinner
  const loadingSpinner = document.getElementById('loading-spinner');
  loadingSpinner.classList.remove('hidden');

  fetch('/exportPlaylist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversationId: currentConversationId }),
    credentials: 'include', // Include cookies
  })
    .then((response) => {

      // Hide the loading spinner
      loadingSpinner.classList.add('hidden');

      if (!response.ok) {
        return response.json().then((errData) => {
          throw new Error(errData.error || 'Failed to export playlist');
        });
      }
      return response.json();
    })
    .then((data) => {
      if (data.success) {
        
        // Show the modal with the success message and link
        showPopup(data.playlistUrl);
      } else {
        throw new Error(data.error || 'Failed to export playlist');
      }
    })
    .catch((error) => {

      // Hide the loading spinner in case of error
      loadingSpinner.classList.add('hidden');

      console.error('Error exporting playlist:', error);
      showNotification('Failed to export playlist: ' + error.message, 'error');
    });
}





// Fetch suggestions for the current conversation
function fetchSuggestions() {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/suggestions`, {
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }
      return response.json();
    })
    .then((suggestions) => {
      renderSuggestions(suggestions);
    })
    .catch((error) => {
      console.error('Error fetching suggestions:', error);
    });
}
// Render suggestions in the UI
function renderSuggestions(suggestions) {
  const suggestionsList = document.getElementById('suggestions-list');
  suggestionsList.innerHTML = ''; // Clear existing items

  suggestions.forEach((song) => {
    // Create suggestion item container
    const li = document.createElement('li');
    li.className = 'suggestion-item';

    // Image element
    const img = document.createElement('img');

    // Use large image URL or default
    img.src = song.imageURL || 'images/BeatBuddyIcon.png'; 
    img.alt = `${song.songTitle} Album Art`;
    img.className = 'song-image';

    // Song details container
    const songDetails = document.createElement('div');
    songDetails.className = 'song-details';

    // Song title
    const songTitle = document.createElement('div');
    songTitle.className = 'song-title';
    songTitle.textContent = song.songTitle;

    // Song artist
    const songArtist = document.createElement('div');
    songArtist.className = 'song-artist';
    songArtist.textContent = song.artist;

    // Append title and artist to details
    songDetails.appendChild(songTitle);
    songDetails.appendChild(songArtist);

    // Add button
    const addButton = document.createElement('button');
    addButton.className = 'add-button';
    addButton.textContent = 'Add';
    addButton.addEventListener('click', function () {
      addSongToPlaylistFromSuggestion(song);
    });

    // Assemble the suggestion item
    li.appendChild(img);
    li.appendChild(songDetails);
    li.appendChild(addButton);

    // Append to suggestions list
    suggestionsList.appendChild(li);
  });
}

function showPopup(playlistUrl) {
  const popupContainer = document.getElementById('popup-container');
  const popupMessage = document.getElementById('popup-message');
  const popupLink = document.getElementById('popup-link');

  // Set the message and link
  popupMessage.textContent = 'Playlist exported to Spotify successfully!';
  popupLink.href = playlistUrl;

  // Show the popup
  popupContainer.classList.remove('hidden');
}

// Close the popup using the close button
document.getElementById('popup-close-left-button').addEventListener('click', () => {
  document.getElementById('popup-container').classList.add('hidden');
});

// Function to add song to playlist from suggestion
function addSongToPlaylistFromSuggestion(song) {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      songTitle: song.songTitle,
      artist: song.artist,
    }),
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to add song to playlist');
      }
      return response.json();
    })
    .then((data) => {
      // Refresh the playlist and suggestions
      fetchPlaylist();
      fetchSuggestions();
    })
    .catch((error) => {
      console.error('Error adding song to playlist:', error);
    });
}


function checkSpotifyConnection() {
  fetch('/spotify/status', {
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to check Spotify connection');
      }
      return response.json();
    })
    .then((data) => {
      let spotifyButton =
        document.getElementById('connect-spotify-button') ||
        document.getElementById('export-playlist-button');
      if (!spotifyButton) {
        // If the button doesn't exist, create it
        spotifyButton = document.createElement('button');
        spotifyButton.id = 'connect-spotify-button';
        document.getElementById('spotify-button-container').appendChild(spotifyButton);
      }

      if (data.isConnected) {
        // User is connected to Spotify
        spotifyButton.textContent = 'Export Playlist to Spotify';
        spotifyButton.id = 'export-playlist-button';
        spotifyButton.removeEventListener('click', connectToSpotify);
        spotifyButton.addEventListener('click', exportPlaylist);
      } else {
        // User is not connected to Spotify
        spotifyButton.textContent = 'Connect to Spotify';
        spotifyButton.id = 'connect-spotify-button';
        spotifyButton.removeEventListener('click', exportPlaylist);
        spotifyButton.addEventListener('click', connectToSpotify);
      }
    })
    .catch((error) => {
      console.error('Error checking Spotify connection status:', error);
    });
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  let interval = seconds / 31536000;

  if (interval >= 1) {
    const years = Math.floor(interval);
    return `${years} year${years !== 1 ? 's' : ''} ago`; //
  }
  interval = seconds / 2592000;
  if (interval >= 1) {
    const months = Math.floor(interval);
    return `${months} month${months !== 1 ? 's' : ''} ago`; 
  }
  interval = seconds / 86400;
  if (interval >= 1) {
    const days = Math.floor(interval);
    return `${days} day${days !== 1 ? 's' : ''} ago`; 
  }
  interval = seconds / 3600;
  if (interval >= 1) {
    const hours = Math.floor(interval);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`; 
  }
  interval = seconds / 60;
  if (interval >= 1) {
    const minutes = Math.floor(interval);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`; 
  }
  const secs = Math.floor(seconds);
  return `${secs} second${secs !== 1 ? 's' : ''} ago`; 
}

function showNotification(message, type = 'success') {
  const notificationContainer = document.getElementById('notification-container');

  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;

  // Add icon and message
  notification.innerHTML = `
      <span class="icon">${type === 'success' ? '✔️' : '❌'}</span>
      ${message}
  `;

  // Append notification to container
  notificationContainer.appendChild(notification);

  // Automatically remove notification after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}
