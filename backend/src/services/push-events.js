export const pushTexts=Object.freeze({
 message:'У вас новое сообщение. Откройте приложение.',
 deposit_credited:'Пополнение зачислено. Подробности в кошельке.',
 deposit_blocked:'По пополнению требуется проверка. Обратитесь в поддержку.',
 referral_credited:'Начислено реферальное вознаграждение. Подробности в кошельке.',
 withdrawal_confirmed:'Вывод подтверждён сетью. Подробности в кошельке.',
 withdrawal_failed:'Вывод не выполнен. Проверьте статус операции в кошельке.',
 withdrawal_review:'Вывод ожидает дополнительной проверки.',
 deal_created:'Создана новая P2P-сделка.',
 deal_paid:'Покупатель отметил оплату. Проверьте поступление средств.',
 deal_ready:'К сделке присоединился второй участник.',
 deal_funded:'Средства по сделке зарезервированы.',
 deal_delivered:'Продавец отметил передачу. Проверьте результат сделки.',
 deal_disputed:'По сделке открыт спор.',
 deal_completed:'Сделка завершена. Подробности доступны в приложении.',
 deal_refunded:'По сделке оформлен возврат.',
 deal_cancelled:'Сделка отменена.'
});
export function eventContent(type){
 if(!Object.hasOwn(pushTexts,type))throw new Error('Unknown notification type');
 return {title:'Гоблин',body:pushTexts[type],eventType:type};
}
export const broadcastPaths=Object.freeze(['/news','/about','/me','/swap','/p2p/my-deals']);
export function validateBroadcast(body){
 const title=typeof body?.title==='string'?body.title.trim():'',text=typeof body?.body==='string'?body.body.trim():'';
 if(!title||title.length>80||!text||text.length>500||!broadcastPaths.includes(body.path)||!(/^[a-f0-9-]{36}$/i.test(body.requestKey||'')))throw Object.assign(new Error('Укажите заголовок до 80 символов, текст до 500 символов и раздел сайта'),{status:400});
 return {title,body:text,path:body.path,key:body.requestKey,eventType:'broadcast'};
}
