// Variables to keep track of current conversation
let currentConversationId = null;

// Fetch the username and create a new conversation on page load
fetch('/user')
  .then(response => {
    if (response.ok) {
      return response.json();
    } else {
      throw new Error("Failed to fetch user");
    }
  })
  .then(data => {
    document.getElementById('welcomeMessage').textContent = "Welcome back, " + data.username + "! Start chatting below.";
    // Create a new conversation after fetching the user
    createNewConversation();
  })
  .catch(error => {
    console.error("An error has occurred fetching username:", error);
  });

// Function to create a new conversation
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
}


function fetchChatHistory() {
  fetch('/conversations')
    .then(response => response.json())
    .then(conversations => {
      const chatHistoryList = document.getElementById('chat-history-list');
      chatHistoryList.innerHTML = ''; // Clear existing list
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
    })
    .catch(error => {
      console.error('Error fetching chat history:', error);
    });
}

// Function to load a conversation
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
}



// Functionality for New Chat button
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