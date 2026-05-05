import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { post, postWithStream } from '../src/utils/http'

test('post sends json and returns raw text response', async () => {
  const server = http.createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      assert.equal(req.headers.authorization, 'Bearer sk-test')
      assert.equal(req.headers.accept, 'application/json')
      assert.deepEqual(JSON.parse(body), { hello: 'world' })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await post(`http://127.0.0.1:${address.port}/v1/test`, 'sk-test', { hello: 'world' }, 3)

    assert.equal(response.ok, true)
    assert.equal(response.status, 200)
    assert.match(response.contentType, /application\/json/)
    assert.equal(response.text, '{"ok":true}')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('postWithStream aggregates chat completion event stream text', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: {"choices":[{"delta":{"content":"![image]("}}]}\n\n')
    res.write('data: {"choices":[{"delta":{"content":"https://cdn.example.com/output.png)"}}]}\n\n')
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await postWithStream(`http://127.0.0.1:${address.port}/v1/chat/completions`, 'sk-test', { stream: true }, 3)
    const json = JSON.parse(response.text)

    assert.equal(response.ok, true)
    assert.match(response.contentType, /text\/event-stream/)
    assert.equal(json.choices[0].message.content, '![image](https://cdn.example.com/output.png)')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('postWithStream reads content from alternative stream fields', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: message\n')
    res.write('data: {"choices":[{"delta":{"content":[{"type":"text","text":"![image](https://cdn.example.com/array.png)"}]}}]}\n\n')
    res.write('data: {"content":"![image](https://cdn.example.com/content.png)"}\n\n')
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await postWithStream(`http://127.0.0.1:${address.port}/v1/chat/completions`, 'sk-test', { stream: true }, 3)
    const json = JSON.parse(response.text)

    assert.equal(
      json.choices[0].message.content,
      '![image](https://cdn.example.com/array.png)![image](https://cdn.example.com/content.png)',
    )
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('postWithStream falls back to raw event text when no known content field exists', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: unknown\n')
    res.write('data: {"result":{"image":"https://cdn.example.com/raw.png"}}\n\n')
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await postWithStream(`http://127.0.0.1:${address.port}/v1/chat/completions`, 'sk-test', { stream: true }, 3)
    const json = JSON.parse(response.text)

    assert.match(json.choices[0].message.content, /https:\/\/cdn\.example\.com\/raw\.png/)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('postWithStream reads non-event-stream response text', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'not a stream' }))
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await postWithStream(`http://127.0.0.1:${address.port}/v1/chat/completions`, 'sk-test', { stream: true }, 3)

    assert.equal(response.text, '{"message":"not a stream"}')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
