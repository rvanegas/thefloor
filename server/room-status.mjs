// Read-only view of the live room: who is in it and whether they may publish.
// Mints nothing.
process.loadEnvFile();
const { RoomServiceClient } = await import('livekit-server-sdk');
const svc = new RoomServiceClient(
  process.env.LIVEKIT_URL.replace(/^ws/, 'http'),
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);
const rooms = await svc.listRooms();
if (!rooms.length) { console.log('no live room'); process.exit(0); }
for (const room of rooms) {
  console.log(`room ${room.name}  participants=${room.numParticipants}`);
  let people = [];
  try {
    people = await svc.listParticipants(room.name);
  } catch {
    console.log('  (room closed while listing)');
    continue;
  }
  for (const p of people) {
    const audio = p.tracks.filter((t) => t.type === 0);
    console.log(
      `  ${p.identity.padEnd(22)} canPublish=${p.permission?.canPublish}` +
        `  audioTracks=${audio.length}` +
        (audio.length ? ` muted=${audio[0].muted}` : '')
    );
  }
}
