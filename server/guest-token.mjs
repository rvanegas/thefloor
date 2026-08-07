// Mints a browser join credential for whichever session room is currently
// live, so a second person can hear and be heard without installing the app.
// Scratch tooling — deleted once the verification is done.
process.loadEnvFile();
const { AccessToken, RoomServiceClient } = await import('livekit-server-sdk');

const url = process.env.LIVEKIT_URL;
const svc = new RoomServiceClient(
  url.replace(/^ws/, 'http'),
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const rooms = await svc.listRooms();
if (!rooms.length) {
  console.log('No live room. Start a session on the phone and have the other');
  console.log('side join, then run this again.');
  process.exit(0);
}

// If several are live, the busiest is the one being tested.
const room = rooms.sort((a, b) => b.numParticipants - a.numParticipants)[0];
const participants = await svc.listParticipants(room.name);

const token = new AccessToken(
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
  { identity: 'guest-listener', name: 'Guest', ttl: 60 * 60 }
);
token.addGrant({
  room: room.name,
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: false,
});

console.log(`room: ${room.name}  (${room.numParticipants} participants)`);
for (const p of participants) {
  const audio = p.tracks.filter((t) => t.type === 0);
  console.log(
    `  ${p.identity}: ${audio.length ? (audio[0].muted ? 'MUTED' : 'live') : 'no audio track'}`
  );
}
console.log('\nSend her this link (valid one hour, this room only):\n');
console.log(
  `https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(url)}&token=${await token.toJwt()}`
);
