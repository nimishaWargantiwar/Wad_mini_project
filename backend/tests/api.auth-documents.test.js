const request = require("supertest");

const Document = require("../models/Document");
const { createTestServer } = require("./helpers/testServer");

describe("Auth and Documents API", () => {
  let testServer;
  let app;

  beforeAll(async () => {
    testServer = await createTestServer();
    app = testServer.app;
  });

  afterAll(async () => {
    await testServer.closeAll();
  });

  test("register -> create document -> list document", async () => {
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Alice",
      email: "alice@test.dev",
      password: "password123",
    });

    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.body.token).toBeTruthy();

    const token = registerResponse.body.token;

    const createResponse = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Design Notes" });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.title).toBe("Design Notes");
    expect(createResponse.body.role).toBe("owner");

    const listResponse = await request(app)
      .get("/documents")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.statusCode).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBe(1);
    expect(listResponse.body[0].title).toBe("Design Notes");
  });

  test("owner can share with viewer and viewer has read access only", async () => {
    const ownerResponse = await request(app).post("/auth/register").send({
      name: "Owner",
      email: "owner@test.dev",
      password: "password123",
    });

    const viewerResponse = await request(app).post("/auth/register").send({
      name: "Viewer",
      email: "viewer@test.dev",
      password: "password123",
    });

    const ownerToken = ownerResponse.body.token;
    const viewerToken = viewerResponse.body.token;

    const createResponse = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Shared Doc" });

    const docId = createResponse.body.id;

    const shareResponse = await request(app)
      .post(`/documents/${docId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "viewer@test.dev", role: "viewer" });

    expect(shareResponse.statusCode).toBe(200);

    const viewerGet = await request(app)
      .get(`/documents/${docId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(viewerGet.statusCode).toBe(200);
    expect(viewerGet.body.role).toBe("viewer");

    const docFromDb = await Document.findById(docId).lean();
    expect(docFromDb.collaborators.length).toBe(1);
  });
});
