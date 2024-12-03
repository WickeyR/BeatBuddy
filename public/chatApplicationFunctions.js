// chatApplicationFunctions.js

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

  // Attach event listeners
  document.getElementById('new-chat-button').addEventListener('click', function () {
    createNewConversation();
    fetchChatHistory();
    fetchPlaylist();
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
  createNewConversation(); // If you want to start a new conversation on page load
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
        li.className = 'chat-history-item'; // Match CSS class

        // Chat title button
        const button = document.createElement('button');
        button.className = 'chat-history-item-button'; // Style per updated CSS
        button.dataset.conversationId = conversation.conversation_id;

        // Format the display title
        const startTime = new Date(conversation.start_time);
        const relativeTime = timeSince(new Date(startTime));
        button.textContent = conversation.title || `Chat from ${relativeTime}`; // Fixed template literal

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
          event.stopPropagation(); // Prevent click from loading the conversation
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
    fetch(`/conversations/${conversationId}`, { // Added quotes
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

  fetch(`/conversations/${currentConversationId}/playlist`, { // Added quotes
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
    img.src = song.song_large_image_url || 'default-image-url.jpg'; // Default image if none available
    img.alt = `${song.song_title} Album Art`; // Fixed template literal
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

    // Delete button (optional)
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.innerHTML = `
      <svg class="delete-icon" viewBox="0 0 24 24">
        <path fill="currentColor" d="M9 3v1H4v2h16V4h-5V3H9zm1 5v10h2V8h-2zm4 0v10h2V8h-2z"></path>
      </svg>
    `; // Used backticks for multi-line HTML
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
    credentials: 'include', // Include cookies
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
  fetch(`/conversations/${conversationId}/messages`, { // Added quotes
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
          messageContentDiv.innerHTML = `<div class="usermessage">${message.message_content}</div>`; // Fixed template literal
        } else {
          messageContentDiv.className = 'appmessagediv';
          messageContentDiv.innerHTML = `<div class="appmessage">${message.message_content}</div>`; // Fixed template literal
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

  if (!userinput) return; // Prevent sending empty messages

  // Display user's message
  upperdiv.innerHTML += `
    <div class="message">
      <div class="usermessagediv">
        <div class="usermessage">
          ${userinput}
        </div>
      </div>
    </div>
  `; // Fixed template literal
  scroll();

  try {
    const response = await fetch(`/api/messageGPT`, { // Added quotes
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userInput: userinput,
        conversationId: currentConversationId, // Pass the conversation ID
      }),
      credentials: 'include', // Include cookies
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
    `; // Fixed template literal
    scroll();
  } catch (error) {
    console.error('Error:', error);
    // Optionally, display an error message to the user
    upperdiv.innerHTML += `
      <div class="message error">
        <div class="error-message">Error: ${error.message}</div>
      </div>
    `; // Fixed template literal
    scroll();
  }

  // Fetch and render the updated playlist
  fetchPlaylist();
}

// Delete a song from the playlist
function deleteSongFromPlaylist(songId) {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist/${songId}`, { // Added quotes
    method: 'DELETE',
    credentials: 'include',
  })
    .then((response) => {
      if (response.ok) {
        // Refresh the playlist
        fetchPlaylist();
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
    `width=${width},height=${height},top=${top},left=${left}` // Fixed template literal
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

// Example usage in exportPlaylist
function exportPlaylist() {
  if (!currentConversationId) return;

  fetch('/exportPlaylist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversationId: currentConversationId }),
    credentials: 'include', // Include cookies
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((errData) => {
          throw new Error(errData.error || 'Failed to export playlist');
        });
      }
      return response.json();
    })
    .then((data) => {
      if (data.success) {
        // Show custom notification
        showNotification('Playlist exported to Spotify successfully!');

        // Open the playlist URL in a new tab
        if (data.playlistUrl) {
          window.open(data.playlistUrl, '_blank');
        }
        // Reload the dashboard page
        window.location.reload();
      } else {
        throw new Error(data.error || 'Failed to export playlist');
      }
    })
    .catch((error) => {
      console.error('Error exporting playlist:', error);
      showNotification('Failed to export playlist: ' + error.message, 'error');
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
    return `${years} year${years !== 1 ? 's' : ''} ago`; // Fixed template literal
  }
  interval = seconds / 2592000;
  if (interval >= 1) {
    const months = Math.floor(interval);
    return `${months} month${months !== 1 ? 's' : ''} ago`; // Fixed template literal
  }
  interval = seconds / 86400;
  if (interval >= 1) {
    const days = Math.floor(interval);
    return `${days} day${days !== 1 ? 's' : ''} ago`; // Fixed template literal
  }
  interval = seconds / 3600;
  if (interval >= 1) {
    const hours = Math.floor(interval);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`; // Fixed template literal
  }
  interval = seconds / 60;
  if (interval >= 1) {
    const minutes = Math.floor(interval);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`; // Fixed template literal
  }
  const secs = Math.floor(seconds);
  return `${secs} second${secs !== 1 ? 's' : ''} ago`; // Fixed template literal
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
