import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { S3Storage } from "./S3Storage.js";

describe("S3Storage", () => {
  const calls: unknown[] = [];
  const fake = {
    async send(cmd: unknown) {
      calls.push(cmd);
      if (cmd instanceof GetObjectCommand) return { Body: Readable.from(["abc"]), ContentLength: 3 };
      return {};
    },
  } as never;
  const storage = new S3Storage({ bucket: "kvito-eu", region: "eu-central-1", accessKeyId: "k", secretAccessKey: "s" }, fake);

  it("puts, gets and removes objects in the configured bucket", async () => {
    await storage.put("a/b.pdf", Buffer.from("abc"), "application/pdf");
    const put = calls[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({ Bucket: "kvito-eu", Key: "a/b.pdf", ContentType: "application/pdf" });

    const got = await storage.get("a/b.pdf");
    expect(got.size).toBe(3);
    const chunks: Buffer[] = [];
    for await (const c of got.stream) chunks.push(Buffer.from(c as string));
    expect(Buffer.concat(chunks).toString()).toBe("abc");

    await storage.remove("a/b.pdf");
    expect(calls[2]).toBeInstanceOf(DeleteObjectCommand);
  });
});
