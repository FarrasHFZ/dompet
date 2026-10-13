# Collection snippets (run with the browser pane's javascript_tool, one profile at a time)

## Instagram  (navigate to https://www.instagram.com/<handle>/ first)
```js
(()=>{const h=document.documentElement.innerHTML;const f=(h.match(/"follower_count":(\d+)/)||[])[1];
const d=document.querySelector('meta[property="og:description"]')?.content||'';
const p=(d.match(/([\d.,]+[KMB]?)\s+Posts/i)||[])[1];const hd=(d.match(/\(@([^)]+)\)/)||[])[1];
return JSON.stringify({platform:'instagram',handle:hd,followers:f?+f:null,postsText:p,title:document.title})})()
```
follower_count in the page HTML is exact (og:description is rounded). Post-level likes need login,
so the IG signal is followers + cadence only.

## TikTok  (navigate to https://www.tiktok.com/@<handle>, wait ~3s)
```js
(async()=>{await new Promise(r=>setTimeout(r,3000));
const j=JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent);
const d=j.__DEFAULT_SCOPE__['webapp.user-detail'];const u=d.userInfo.user,s=d.userInfo.stats;
return JSON.stringify({platform:'tiktok',handle:u.uniqueId,nickname:u.nickname,verifiedBadge:u.verified,followers:s.followerCount,likes:s.heartCount,videos:s.videoCount})})()
```

## Impostor check (do this before trusting a handle)
Real creators have 100k+ followers, hundreds of posts, and a matching display name. Tiny counts, 0 posts,
or a private/empty profile = wrong handle: leave `verified:false` in kols.json and ask the owner.
