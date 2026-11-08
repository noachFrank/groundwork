import dgram from 'node:dgram';

export interface DnsEvent {
  name: string;
  type: string;
  answer: string | null;
  code: 'NOERROR' | 'NXDOMAIN';
}

const TYPE_A = 1;
const TYPE_PTR = 12;
const TYPE_TXT = 16;
const TYPE_NAMES: Record<number, string> = { 1: 'A', 12: 'PTR', 16: 'TXT', 28: 'AAAA' };

function parseQuestion(msg: Buffer) {
  let offset = 12;
  const labels: string[] = [];
  while (offset < msg.length) {
    const len = msg[offset];
    if (len === 0) break;
    if (len > 63) throw new Error('Compressed names are not valid in a question');
    labels.push(msg.subarray(offset + 1, offset + 1 + len).toString('ascii'));
    offset += len + 1;
  }
  const end = offset + 1;
  if (end + 4 > msg.length) throw new Error('Truncated question');
  return { name: labels.join('.').toLowerCase(), type: msg.readUInt16BE(end), questionEnd: end + 4 };
}

function encodeName(name: string): Buffer {
  const parts = name.split('.').filter(Boolean).map((l) => {
    const b = Buffer.from(l, 'ascii');
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

/**
 * A real, if tiny, DNS server: it reads and writes actual DNS packets, so
 * `nslookup` works against it with no internet. Windows's nslookup first asks who
 * the server is (a PTR question), so that is answered as well.
 */
export class PracticeDns {
  records = new Map<string, string>();
  txt = new Map<string, string>();
  onQuery: (e: DnsEvent) => void = () => {};
  private socket: dgram.Socket | null = null;
  private port: number;

  /** The port actually in use once started, or null if none could be opened. */
  activePort: number | null = null;
  private fallbackPort: number;

  /**
   * Windows's nslookup ignores its `-port` option and always asks port 53, so the
   * standard port is tried first. It needs no admin rights on 127.0.0.1. If something
   * else already uses 53, the fallback port still works with the in-app lookup box.
   */
  constructor(port: number, fallbackPort: number) {
    this.port = port;
    this.fallbackPort = fallbackPort;
    this.reset();
  }

  reset() {
    this.records = new Map([
      ['shop.groundwork.test', '10.0.0.42'],
      ['api.groundwork.test', '10.0.0.43'],
      ['www.groundwork.test', '10.0.0.44'],
    ]);
    this.txt = new Map([['groundwork.test', 'Hello from your practice DNS server']]);
  }

  respond(msg: Buffer): Buffer {
    const q = parseQuestion(msg);
    let rcode = 0;
    let rdata: Buffer | null = null;
    let answerType = q.type;
    let answerText: string | null = null;

    if (q.type === TYPE_PTR) {
      if (q.name.endsWith('in-addr.arpa')) {
        rdata = encodeName('practice-dns.groundwork.test');
        answerText = 'practice-dns.groundwork.test';
      } else rcode = 3;
    } else if (q.type === TYPE_A && this.records.has(q.name)) {
      answerText = this.records.get(q.name)!;
      rdata = Buffer.from(answerText.split('.').map(Number));
    } else if (q.type === TYPE_TXT && this.txt.has(q.name)) {
      answerText = this.txt.get(q.name)!;
      const b = Buffer.from(answerText, 'ascii');
      rdata = Buffer.concat([Buffer.from([b.length]), b]);
    } else if (!this.records.has(q.name) && !this.txt.has(q.name)) {
      // Name doesn't exist at all. A known name with no record of this type (like
      // the AAAA question sent alongside A) is an empty, successful answer.
      rcode = 3;
    }
    answerType = q.type;

    this.onQuery({
      name: q.name,
      type: TYPE_NAMES[q.type] ?? String(q.type),
      answer: answerText,
      code: rcode === 3 ? 'NXDOMAIN' : 'NOERROR',
    });

    const header = Buffer.alloc(12);
    msg.copy(header, 0, 0, 2);
    header[2] = 0x84 | (msg[2] & 0x01); // response, authoritative, copy "recursion desired"
    header[3] = rcode;
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(rdata ? 1 : 0, 6);
    const question = msg.subarray(12, q.questionEnd);
    if (!rdata) return Buffer.concat([header, question]);

    const answer = Buffer.alloc(12);
    answer.writeUInt16BE(0xc00c, 0); // the name is a pointer back to the question
    answer.writeUInt16BE(answerType, 2);
    answer.writeUInt16BE(1, 4); // class IN
    answer.writeUInt32BE(60, 6); // time to live, in seconds
    answer.writeUInt16BE(rdata.length, 10);
    return Buffer.concat([header, question, answer, rdata]);
  }

  private bind(port: number): Promise<dgram.Socket | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', () => {
        socket.close();
        resolve(null);
      });
      socket.bind(port, '127.0.0.1', () => {
        socket.removeAllListeners('error');
        socket.on('error', () => {});
        resolve(socket);
      });
    });
  }

  async start(onError: (e: Error) => void) {
    for (const port of [this.port, this.fallbackPort]) {
      const socket = await this.bind(port);
      if (!socket) continue;
      this.socket = socket;
      this.activePort = port;
      socket.on('message', (msg, rinfo) => {
        try {
          socket.send(this.respond(msg), rinfo.port, rinfo.address);
        } catch {
          // A malformed packet gets no reply, like most DNS servers.
        }
      });
      return;
    }
    onError(new Error(`ports ${this.port} and ${this.fallbackPort} are both in use`));
  }

  stop() {
    this.socket?.close();
    this.socket = null;
  }
}
