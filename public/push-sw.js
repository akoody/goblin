self.addEventListener('push',event=>{
 let payload;try{payload=event.data.json();}catch{return;}
 event.waitUntil(self.registration.showNotification(payload.title||'Гоблин',{body:payload.body||'Новое уведомление',tag:payload.key,data:{recipientId:payload.recipientId,path:payload.path},icon:'/favicon.svg'}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const data=event.notification.data||{};
 // Only a fixed local entrypoint receives untrusted notification data.
 const query=new URLSearchParams({pushRecipient:String(data.recipientId||''),pushPath:String(data.path||'')});
 event.waitUntil(clients.openWindow('/?'+query));
});
