// Variables to keep track of current conversation
let currentConversationId = null;

// Fetch the username and conversations on page load
fetch('/user')
  .then(response => {
    if (response.ok) {
      return response.json();
    } else {
      throw new Error("Failed to fetch user");
    }
  })
  .then(data => {
    // Update the welcome message if you have one
    // After fetching the user, fetch the conversations
    createNewConversation();
    fetchChatHistory();
  })
  .catch(error => {
    console.error("An error has occurred fetching username:", error);
  });

function fetchChatHistory() {
  fetch('/conversations')
    .then(response => response.json())
    .then(conversations => {
      const chatHistoryList = document.getElementById('chat-history-list');
      chatHistoryList.innerHTML = ''; // Clear existing list

      if (conversations.length > 0) {
        conversations.forEach(conversation => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.className = 'chat-history-item';
          button.textContent = conversation.title || `Chat from ${new Date(conversation.start_time).toLocaleString()}`;
          button.dataset.conversationId = conversation.conversation_id;
          button.addEventListener('click', function () {
            loadConversation(conversation.conversation_id);
          });
          li.appendChild(button);
          chatHistoryList.appendChild(li);
        });

        // Load the most recent conversation
        loadConversation(conversations[0].conversation_id);
      } else {
        // If no conversations, create a new one
        createNewConversation();
      }
    })
    .catch(error => {
      console.error('Error fetching chat history:', error);
    });
}

function fetchPlaylist() {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist`)
    .then(response => response.json())
    .then(playlist => {
      renderPlaylist(playlist);
    })
    .catch(error => {
      console.error('Error fetching playlist:', error);
    });
}

function renderPlaylist(playlist) {
  const playlistList = document.getElementById('chat-playlist-list');
  playlistList.innerHTML = ''; // Clear existing items

  playlist.forEach(song => {
    const li = document.createElement('li');
    li.className = 'playlist-item';

    // Image element
    const img = document.createElement('img');
    img.src = song.song_large_image_url || 'default-image-url.jpg'; // Provide a default image URL if needed
    img.alt = 'Album Art';
    img.className = 'song-image';

    // Song details
    const songDetails = document.createElement('div');
    songDetails.className = 'song-details';

    const songTitle = document.createElement('div');
    songTitle.className = 'song-title';
    songTitle.textContent = song.song_title;

    const songArtist = document.createElement('div');
    songArtist.className = 'song-artist';
    songArtist.textContent = song.song_artist;

    songDetails.appendChild(songTitle);
    songDetails.appendChild(songArtist);

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = '×';
    deleteButton.dataset.songId = song.id; // Assuming each song has a unique 'id' field
    deleteButton.addEventListener('click', function() {
      deleteSongFromPlaylist(song.id);
    });

    // Assemble the playlist item
    li.appendChild(img);
    li.appendChild(songDetails);
    li.appendChild(deleteButton);

    playlistList.appendChild(li);
  });
}





// Function to remove a conversation 
function deleteConversation(){

}

function createNewConversation() {
  fetch('/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: null }),
  })
    .then(response => response.json())
    .then(conversation => {
      currentConversationId = conversation.conversation_id;
      // Clear the chat window
      const upperDiv = document.getElementById('upperid');
      upperDiv.innerHTML = '';
      // Refresh chat history
      fetchChatHistory();
    })
    .catch(error => {
      console.error('Error creating new conversation:', error);
    });
}

function loadConversation(conversationId) {
  currentConversationId = conversationId;
  fetch(`/conversations/${conversationId}/messages`)
    .then(response => response.json())
    .then(messages => {
      // Clear existing messages
      const upperDiv = document.getElementById('upperid');
      upperDiv.innerHTML = '';

      // Render messages
      messages.forEach(message => {
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
    })
    .catch(error => {
      console.error('Error loading conversation:', error);
    });
    fetchPlaylist();

}

// Function to send a message
async function sendMessage() {
  const userinput = document.getElementById('userinput').value;
  const upperdiv = document.getElementById('upperid');

  // Display user's message
  upperdiv.innerHTML += `<div class="message">
      <div class="usermessagediv">
          <div class="usermessage">
              ${userinput}
          </div>
      </div>
  </div>`;
  scroll();

  try {
    const response = await fetch(`/api/messageGPT`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userInput: userinput,
        conversationId: currentConversationId, // Pass the conversation ID
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // Display AI's response
      upperdiv.innerHTML += `<div class="message">
        <div class="appmessagediv">
            <div class="appmessage">
                ${data.response}
            </div>
        </div>
      </div>`;
      scroll();
    } else {
      console.error('Error from server:', data.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
  fetchPlaylist();
}


function deleteSongFromPlaylist(songId) {
  if (!currentConversationId) return;

  fetch(`/conversations/${currentConversationId}/playlist/${songId}`, {
    method: 'DELETE',
  })
    .then(response => {
      if (response.ok) {
        // Refresh the playlist
        fetchPlaylist();
      } else {
        console.error('Failed to delete song from playlist');
      }
    })
    .catch(error => {
      console.error('Error deleting song from playlist:', error);
    });
}



// Event listener for New Chat button
document.getElementById('new-chat-button').addEventListener('click', function () {
  createNewConversation();
});

// Scroll to bottom function
function scroll() {
  var div = document.getElementById("upperid");
  div.scrollTop = div.scrollHeight;
}

// Event listener for message form submission
document.getElementById("userinputform").addEventListener("submit", function (event) {
  event.preventDefault();
  sendMessage();
  document.getElementById('userinput').value = "";
});

// Event listener for Enter key in textarea
document.getElementById("userinput").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
    document.getElementById('userinput').value = "";
  }
});


//spotify
document.getElementById('connect-spotify-button').addEventListener('click', function () {
  window.location.href = '/auth/spotify';
});

// // Event listener for Export Playlist button
// document.getElementById('export-playlist-button').addEventListener('click', function () {
//   exportPlaylist();
// });
function checkSpotifyConnection() {
  fetch('/spotify/status')
    .then(response => response.json())
    .then(data => {
      if (data.isConnected) {
        // User is connected to Spotify
        const spotifyButton = document.getElementById('connect-spotify-button');
        spotifyButton.textContent = 'Export Playlist to Spotify';
        spotifyButton.id = 'export-playlist-button';
        // Update the event listener
        spotifyButton.removeEventListener('click', connectToSpotify);
        spotifyButton.addEventListener('click', exportPlaylist);
      } else {
        // User is not connected to Spotify
        // Ensure the button says "Connect to Spotify" and has the correct event listener
        const spotifyButton = document.getElementById('connect-spotify-button');
        spotifyButton.textContent = 'Connect to Spotify';
        spotifyButton.id = 'connect-spotify-button';
        spotifyButton.removeEventListener('click', exportPlaylist);
        spotifyButton.addEventListener('click', connectToSpotify);
      }
    })
    .catch(error => {
      console.error('Error checking Spotify connection status:', error);
    });
}

// Call the function on page load
checkSpotifyConnection();

function connectToSpotify() {
  window.location.href = '/auth/spotify';
}

function exportPlaylist() {
  if (!currentConversationId) return;

  fetch('/exportPlaylist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversationId: currentConversationId }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert('Playlist exported to Spotify successfully!');
       
      } else {
        alert('Failed to export playlist: ' + data.error);
      }
    })
    .catch(error => {
      console.error('Error exporting playlist:', error);
    });
}

// Initial event listener
document.getElementById('connect-spotify-button').addEventListener('click', connectToSpotify);
