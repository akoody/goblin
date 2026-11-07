import React from 'react';
export function ChatProfile({profile}){
 const role=profile?.role==='admin'?'Администратор':profile?.role==='helper'?'Хелпер':'';
 return role?<details><summary>{profile.username} · {role}</summary><p>{role}<br/>Профиль #{profile.id} · {profile.username}</p></details>:<strong>{profile?.username||'Пользователь'}</strong>;
}
