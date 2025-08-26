import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";
import { formatLastSeen } from "./utils/formatLastSeen";
import Auth from "./components/Auth";

function App() {
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [receiver, setReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [unreadCounts, setUnreadCounts] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});

  const messagesEndRef = useRef(null);
  // Added a ref to safely access the current receiver in real-time callbacks
  const receiverRef = useRef(null);

  // --- HELPER FUNCTIONS (Moved to the top for clarity) ---

  const ensureUserExists = async (user) => {
    await supabase
      .from("users")
      .upsert(
        { id: user.id, email: user.email, last_seen: new Date().toISOString() },
        { onConflict: "id" }
      );
  };

  const updateLastSeen = async (userId) => {
    await supabase
      .from("users")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", userId);
  };

   const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !receiver) return;

    const messageContent = newMessage.trim();
   const tempId =
    `temp-${(crypto?.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2)}`;

    const optimisticMessage = {
   id: tempId, 
      content: messageContent,
      sender_id: session.user.id,
      receiver_id: receiver.id,
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
   

    setNewMessage("");

     try {
    const { data: saved, error } = await supabase
      .from("messages")
      .insert({
        content: messageContent,
        sender_id: session.user.id,
        receiver_id: receiver.id,
      })
      .select("id, content, sender_id, receiver_id, created_at, is_read, read_at")
      .single();

    if (!error && saved) {
      // 🔑 Reconcile optimistic message with real DB row
      setMessages(prev =>
        prev.map(msg => (msg.id === tempId ? saved : msg))
      );
    }

    if (error) {
      console.error("Error sending message:", error);
      // remove optimistic message if insert failed
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setNewMessage(messageContent);
    }
  } catch (err) {
    console.error("Error in handleSendMessage:", err);
  }

  
  };


  // --- USE EFFECT HOOKS (Restructured for stability) ---

  // 1. Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 2. Keep the receiver ref updated whenever the receiver state changes
  useEffect(() => {
    receiverRef.current = receiver;
  }, [receiver]);

  // 3. Handle authentication (runs once)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === "SIGNED_IN" && session) {
        ensureUserExists(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 4. Handle presence channel (depends only on session)
  useEffect(() => {
    if (!session) return;
    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: session.user.id } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const onlineUsersMap = {};
        for (const id in presenceChannel.presenceState()) {
          onlineUsersMap[id] = true;
        }
        setOnlineUsers(onlineUsersMap);
      })
      .on("presence", { event: "join" }, ({ key }) =>
        setOnlineUsers((prev) => ({ ...prev, [key]: true }))
      )
      .on("presence", { event: "leave" }, ({ key }) => {
        updateLastSeen(key);
        setOnlineUsers((prev) => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => supabase.removeChannel(presenceChannel);
  }, [session]);

  // 5. This useEffect now ONLY handles what happens when you select a chat
  useEffect(() => {
    if (!receiver || !session) return;

  
  
const fetchConversation = async () => {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, sender_id, receiver_id, created_at, is_read, read_at")
    .or(
      `and(sender_id.eq.${session.user.id},receiver_id.eq.${receiver.id}),and(sender_id.eq.${receiver.id},receiver_id.eq.${session.user.id})`
    )
    .order("created_at", { ascending: true });

  if (error) console.error("Error fetching conversation:", error);
  else setMessages(data || []);
};


    const markConversationAsRead = async () => {
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("sender_id", receiver.id)
        .eq("receiver_id", session.user.id)
        .eq("is_read", false);
      setUnreadCounts((prev) => ({ ...prev, [receiver.id]: 0 }));
    };

    // This now works because the real-time channel below is stable.
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("chat_with", receiver.id);
    window.history.pushState({}, "", newUrl);
    fetchConversation();
    markConversationAsRead();
  }, [receiver, session]);

  // 6. This useEffect now creates ONE persistent real-time channel for the app
  useEffect(() => {
    if (!session) return;

    const loadMessages = async (receiverId) => {
  if (!receiverId) return;

  const { data, error } = await supabase
    .from("messages")
    .select("id, content, sender_id, receiver_id, created_at, read_at")
    .or(
      `and(sender_id.eq.${session.user.id},receiver_id.eq.${receiverId}),
       and(sender_id.eq.${receiverId},receiver_id.eq.${session.user.id})`
    )
    .order("created_at", { ascending: true });

  if (!error) {
    setMessages(data || []);
  }
};


    // Load initial users and unread counts
    const fetchInitialData = async () => {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, email, last_seen")
        .not("id", "eq", session.user.id);
      setUsers(usersData || []);
      const { data: countsData } = await supabase.rpc("get_unread_counts", {
        current_user_id: session.user.id,
      });
      const counts = (countsData || []).reduce((acc, item) => {
        acc[item.sender_id] = item.unread_count;
        return acc;
      }, {});
      setUnreadCounts(counts);
    };
    fetchInitialData();

    // Load user from URL on initial load
    const loadUserFromUrl = async () => {
      const receiverId = new URLSearchParams(window.location.search).get(
        "chat_with"
      );
      if (receiverId) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", receiverId)
          .single();
        if (data)
          {
            setReceiver(data);
            loadMessages(receiverId);
          } 
      }
    };
    loadUserFromUrl();

    // The single, stable channel subscription
    const channel = supabase
      .channel("realtime-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "users" },
        (payload) => {
          if (payload.new.id !== session.user.id)
            setUsers((prev) => [...prev, payload.new]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          setUsers((prev) =>
            prev.map((user) =>
              user.id === payload.new.id ? payload.new : user
            )
          );
          // Using receiverRef.current here to check the currently selected user
          if (receiverRef.current && receiverRef.current.id === payload.new.id)
            setReceiver(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMessage = payload.new;
    const currentReceiver = receiverRef.current;

    const isForCurrentChat =
      (newMessage.sender_id === session.user.id &&
        newMessage.receiver_id === currentReceiver?.id) ||
      (newMessage.sender_id === currentReceiver?.id &&
        newMessage.receiver_id === session.user.id);

    if (isForCurrentChat) {
      // ✅ Add the message to UI immediately
      setMessages((prev) =>
        prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]
      );

      // 👇 Fix: If I'm the receiver and chat is open → mark as read instantly
      if (newMessage.receiver_id === session.user.id) {
        await supabase
          .from("messages")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", newMessage.id);

        // clear unread badge
        setUnreadCounts((prev) => ({ ...prev, [newMessage.sender_id]: 0 }));
      }
    } else if (newMessage.receiver_id === session.user.id) {
      // Chat not open → increase unread count
      setUnreadCounts((prev) => ({
        ...prev,
        [newMessage.sender_id]: (prev[newMessage.sender_id] || 0) + 1,
      }));
    }
  }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
           console.log("--- MESSAGE UPDATE EVENT ---", payload.new);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]); 




  if (!session) {
    return <Auth />;
  }

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-gray-100">
      <div className="flex w-[800px] h-[600px] shadow-lg rounded-lg overflow-hidden">

        <div className="w-1/3 flex flex-col bg-gray-50 border-r border-gray-300">
          <h3 className="p-4 bg-gray-200 font-semibold">
            Matches -{" "}
            <span className="font-normal text-sm">{session.user.email}</span>
          </h3>
          {users.map((user) => (
            <div
              key={user.id}
              className={`p-4 cursor-pointer border-b hover:bg-gray-200 ${
                receiver?.id === user.id ? "bg-blue-500 text-white" : ""
              }`}
              onClick={() => setReceiver(user)}
            >
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="font-medium">{user.email}</span>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        onlineUsers[user.id] ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    <span
                      className={
                        onlineUsers[user.id]
                          ? "text-green-600"
                          : "text-gray-500"
                      }
                    >
                      {onlineUsers[user.id]
                        ? "Online"
                        : user.last_seen
                        ? formatLastSeen(user.last_seen)
                        : "Offline"}
                    </span>
                  </div>
                </div>
                {unreadCounts[user.id] > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCounts[user.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
          <button
            className="mt-auto p-4 bg-red-500 text-white font-semibold hover:bg-red-600"
            onClick={() => supabase.auth.signOut()}
          >
            Logout
          </button>
        </div>


        <div className="w-2/3 flex flex-col">
          {receiver ? (
            <>
              <div className="p-4 bg-gray-200 border-b">
                <div className="font-semibold">Chat with {receiver.email}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      onlineUsers[receiver.id] ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                  <span
                    className={
                      onlineUsers[receiver.id]
                        ? "text-green-600"
                        : "text-gray-500"
                    }
                  >
                    {onlineUsers[receiver.id]
                      ? "Online"
                      : receiver.last_seen
                      ? formatLastSeen(receiver.last_seen)
                      : "Offline"}
                  </span>
                </div>
              </div>
              <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-400">
                    No messages yet.
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`px-4 py-2 rounded-2xl max-w-[70%] break-words ${
                        msg.sender_id === session.user.id
                          ? "bg-blue-500 text-white self-end"
                          : "bg-gray-200 text-gray-800 self-start"
                      }`}
                    >
                      <div>{msg.content}</div>

                      {msg.sender_id === session.user.id && (
                        <div className="text-xs mt-1 opacity-70 text-right">
                          {msg.is_read
                            ? msg.read_at
                              ? `Read at ${formatLastSeen(msg.read_at)}
                                  `
                              : "Read"
                            : "Sent"}
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div ref={messagesEndRef} />
              </div>
              <form
                className="flex p-3 border-t border-gray-300"
                onSubmit={handleSendMessage}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-grow border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="submit"
                  className="ml-2 rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-600 bg-blue-500 text-white"
                >
                  ➤
                </button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-gray-500">
              Select a user to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
