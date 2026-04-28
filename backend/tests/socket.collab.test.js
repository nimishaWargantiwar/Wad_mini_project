const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const Y = require("yjs");

const { createTestServer } = require("./helpers/testServer");

const onceWithTimeout = (socket, eventName, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe("Socket collaboration", () => {
  let testServer;
  let app;
  let url;

  beforeAll(async () => {
    testServer = await createTestServer();
    app = testServer.app;

    await new Promise((resolve) => {
      testServer.server.listen(0, () => {
        const { port } = testServer.server.address();
        url = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await testServer.closeAll();
  });

  test("authenticated clients can join and receive yjs updates", async () => {
    const aliceAuth = await request(app).post("/auth/register").send({
      name: "Alice",
      email: "alice-socket@test.dev",
      password: "password123",
    });

    const bobAuth = await request(app).post("/auth/register").send({
      name: "Bob",
      email: "bob-socket@test.dev",
      password: "password123",
    });

    const createDoc = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${aliceAuth.body.token}`)
      .send({ title: "Realtime Doc" });

    const docId = createDoc.body.id;

    await request(app)
      .post(`/documents/${docId}/share`)
      .set("Authorization", `Bearer ${aliceAuth.body.token}`)
      .send({ email: "bob-socket@test.dev", role: "editor" });

    const aliceSocket = ioClient(url, {
      auth: { token: aliceAuth.body.token },
      transports: ["websocket"],
    });

    const bobSocket = ioClient(url, {
      auth: { token: bobAuth.body.token },
      transports: ["websocket"],
    });

    await Promise.all([
      onceWithTimeout(aliceSocket, "connect"),
      onceWithTimeout(bobSocket, "connect"),
    ]);

    const emptyVector = Array.from(Y.encodeStateVector(new Y.Doc()));

    const aliceJoin = await new Promise((resolve) => {
      aliceSocket.emit("join-room", { docId, stateVector: emptyVector }, resolve);
    });

    const bobJoin = await new Promise((resolve) => {
      bobSocket.emit("join-room", { docId, stateVector: emptyVector }, resolve);
    });

    expect(aliceJoin.ok).toBe(true);
    expect(bobJoin.ok).toBe(true);

    const localDoc = new Y.Doc();
    const text = localDoc.getText("content");
    text.insert(0, "hello");
    const update = Y.encodeStateAsUpdate(localDoc);

    const yjsUpdatePromise = onceWithTimeout(bobSocket, "yjs-update");

    aliceSocket.emit("yjs-update", {
      docId,
      update: Array.from(update),
    });

    const eventPayload = await yjsUpdatePromise;
    expect(eventPayload.docId).toBe(docId);
    expect(Array.isArray(eventPayload.update)).toBe(true);

    aliceSocket.disconnect();
    bobSocket.disconnect();
  });
});
