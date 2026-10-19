// 機場宵禁（當地時間）。宵禁時段內不得起飛或降落（緊急狀況除外，第一階段不模擬緊急狀況）。
// src：資料來源。'player' = 遊戲設計者提供；'wiki' = 維基百科 Night flying restrictions 條目；'verify' = 公開資訊整理、待校對。
window.CURFEWS = {
  KHH: { from: '00:00', to: '06:30', note: '高雄小港國際機場宵禁', src: 'player' },
  TSA: { from: '23:00', to: '06:00', note: '臺北松山機場夜間禁航', src: 'verify' },
  ITM: { from: '21:00', to: '07:00', note: '大阪伊丹機場夜間禁航', src: 'verify' },
  GMP: { from: '23:00', to: '06:00', note: '首爾金浦機場夜間禁航', src: 'verify' },
  NRT: { from: '00:00', to: '06:00', note: '東京成田機場夜間禁航', src: 'verify' },
  SYD: { from: '23:00', to: '06:00', note: '雪梨機場宵禁', src: 'wiki' },
  ADL: { from: '23:00', to: '06:00', note: '阿德雷德機場宵禁', src: 'wiki' },
  OOL: { from: '23:00', to: '06:00', note: '黃金海岸機場宵禁', src: 'wiki' },
  NTL: { from: '22:00', to: '06:00', note: '紐卡索機場宵禁', src: 'wiki' },
  ZQN: { from: '22:00', to: '07:00', note: '皇后鎮機場宵禁', src: 'wiki' },
  WLG: { from: '00:00', to: '06:00', note: '威靈頓機場宵禁', src: 'wiki' },
  FRA: { from: '23:00', to: '05:00', note: '法蘭克福機場夜間禁航', src: 'wiki' },
  CGN: { from: '00:00', to: '05:00', note: '科隆波昂機場客機夜間禁航', src: 'wiki' },
  BUD: { from: '00:00', to: '05:00', note: '布達佩斯機場夜間禁航', src: 'wiki' },
  ZRH: { from: '23:30', to: '06:00', note: '蘇黎世機場宵禁', src: 'wiki' },
};
