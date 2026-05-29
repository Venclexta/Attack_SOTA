import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const publicationMap = new Map([
  [
    "aes-128-192-256",
    {
      designPaper: "AES Proposal: Rijndael",
      designVenue: "AES Candidate Submission 1998",
      designUrl:
        "https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf"
    }
  ],
  [
    "aes-256",
    {
      designPaper: "AES Proposal: Rijndael",
      designVenue: "AES Candidate Submission 1998",
      designUrl:
        "https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf"
    }
  ],
  [
    "aes-128",
    {
      designPaper: "AES Proposal: Rijndael",
      designVenue: "AES Candidate Submission 1998",
      designUrl:
        "https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf"
    }
  ],
  [
    "des",
    {
      designPaper: "Data Encryption Standard",
      designVenue: "NIST FIPS 46-3",
      designUrl: "https://csrc.nist.gov/pubs/fips/46-3/final"
    }
  ],
  [
    "present-80",
    {
      designPaper: "PRESENT: An Ultra-Lightweight Block Cipher",
      designVenue: "CHES 2007",
      designUrl: "https://doi.org/10.1007/978-3-540-74735-2_31"
    }
  ],
  [
    "present",
    {
      designPaper: "PRESENT: An Ultra-Lightweight Block Cipher",
      designVenue: "CHES 2007",
      designUrl: "https://doi.org/10.1007/978-3-540-74735-2_31"
    }
  ],
  [
    "serpent",
    {
      designPaper: "Serpent: A Candidate Block Cipher for the Advanced Encryption Standard",
      designVenue: "AES Candidate Submission 1998",
      designUrl: "https://www.cl.cam.ac.uk/archive/rja14/Papers/serpent.pdf"
    }
  ],
  [
    "twofish",
    {
      designPaper: "Twofish: A 128-Bit Block Cipher",
      designVenue: "AES Candidate Submission 1998",
      designUrl: "https://www.schneier.com/wp-content/uploads/2016/02/paper-twofish-paper.pdf"
    }
  ],
  [
    "rc6",
    {
      designPaper: "The RC6 Block Cipher",
      designVenue: "AES Candidate Submission 1998",
      designUrl: "https://www.cerias.purdue.edu/apps/reports_and_papers/view/2029"
    }
  ],
  [
    "misty1",
    {
      designPaper: "New Block Encryption Algorithm MISTY",
      designVenue: "FSE 1997",
      designUrl: "https://doi.org/10.1007/BFb0052334"
    }
  ],
  [
    "kasumi",
    {
      designPaper: "Specification of the 3GPP Confidentiality and Integrity Algorithms UEA2 and UIA2",
      designVenue: "3GPP TS 35.202",
      designUrl: "https://www.etsi.org/deliver/etsi_ts/135200_135299/135202/17.00.00_60/ts_135202v170000p.pdf"
    }
  ],
  [
    "camellia-128",
    {
      designPaper: "A Description of the Camellia Encryption Algorithm",
      designVenue: "RFC 3713",
      designUrl: "https://www.rfc-editor.org/rfc/rfc3713"
    }
  ],
  [
    "clefia-128",
    {
      designPaper: "The 128-Bit Blockcipher CLEFIA",
      designVenue: "RFC 6114",
      designUrl: "https://www.rfc-editor.org/rfc/rfc6114"
    }
  ],
  [
    "sm4-sms4",
    {
      designPaper: "The SM4 Block Cipher Algorithm and Its Modes of Operations",
      designVenue: "IETF Internet-Draft / GB/T 32907-2016",
      designUrl: "https://datatracker.ietf.org/doc/html/draft-ribose-cfrg-sm4"
    }
  ],
  [
    "aria-128",
    {
      designPaper: "A Description of the ARIA Encryption Algorithm",
      designVenue: "RFC 5794",
      designUrl: "https://www.rfc-editor.org/rfc/rfc5794"
    }
  ],
  [
    "prince",
    {
      designPaper: "PRINCE - A Low-Latency Block Cipher for Pervasive Computing Applications",
      designVenue: "ASIACRYPT 2012",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-642-34961-4_12"
    }
  ],
  [
    "skinny-64-128",
    {
      designPaper: "The SKINNY Family of Block Ciphers and Its Low-Latency Variant MANTIS",
      designVenue: "CRYPTO 2016",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-662-53008-5_5"
    }
  ],
  [
    "gift-64",
    {
      designPaper: "GIFT: A Small Present",
      designVenue: "CHES 2017",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-319-66787-4_16"
    }
  ],
  [
    "simon32-64",
    {
      designPaper: "The Simon and Speck Families of Lightweight Block Ciphers",
      designVenue: "IACR ePrint 2013/404",
      designUrl: "https://eprint.iacr.org/2013/404"
    }
  ],
  [
    "speck32-64",
    {
      designPaper: "The Simon and Speck Families of Lightweight Block Ciphers",
      designVenue: "IACR ePrint 2013/404",
      designUrl: "https://eprint.iacr.org/2013/404"
    }
  ],
  [
    "led-64",
    {
      designPaper: "LED: A Lightweight Block Cipher",
      designVenue: "CHES 2011",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-642-23951-9_22"
    }
  ],
  [
    "kuznyechik",
    {
      designPaper: "GOST R 34.12-2015: Block Cipher Kuznyechik",
      designVenue: "RFC 7801",
      designUrl: "https://www.rfc-editor.org/rfc/rfc7801"
    }
  ],
  [
    "md5",
    {
      designPaper: "The MD5 Message-Digest Algorithm",
      designVenue: "RFC 1321",
      designUrl: "https://www.rfc-editor.org/rfc/rfc1321"
    }
  ],
  [
    "md4",
    {
      designPaper: "The MD4 Message-Digest Algorithm",
      designVenue: "RFC 1320",
      designUrl: "https://www.rfc-editor.org/rfc/rfc1320"
    }
  ],
  [
    "sha-1",
    {
      designPaper: "Secure Hash Standard",
      designVenue: "NIST FIPS 180-1",
      designUrl: "https://csrc.nist.gov/pubs/fips/180-1/final"
    }
  ],
  [
    "sha-256",
    {
      designPaper: "Secure Hash Standard (SHS)",
      designVenue: "NIST FIPS 180-4",
      designUrl: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final"
    }
  ],
  [
    "sha-512",
    {
      designPaper: "Secure Hash Standard (SHS)",
      designVenue: "NIST FIPS 180-4",
      designUrl: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final"
    }
  ],
  [
    "ripemd",
    {
      designPaper: "Integrity Primitives for Secure Information Systems: Final RIPE Report of RACE Integrity Primitives Evaluation",
      designVenue: "LNCS 1007 / Springer",
      designUrl: "https://link.springer.com/book/10.1007/3-540-60640-8"
    }
  ],
  [
    "whirlpool",
    {
      designPaper: "Whirlpool: A Hash Function Based on AES",
      designVenue: "First Open NESSIE Workshop",
      designUrl: "https://www.larc.usp.br/~pbarreto/WhirlpoolPage.html"
    }
  ],
  [
    "gr-stl-256",
    {
      designPaper: "Grøstl - a SHA-3 Candidate",
      designVenue: "SHA-3 Submission to NIST",
      designUrl: "http://www.groestl.info/Groestl.pdf"
    }
  ],
  [
    "skein-512",
    {
      designPaper: "The Skein Hash Function Family",
      designVenue: "SHA-3 Submission to NIST",
      designUrl: "https://www.schneier.com/wp-content/uploads/2015/01/skein.pdf"
    }
  ],
  [
    "blake-32",
    {
      designPaper: "BLAKE",
      designVenue: "SHA-3 Submission to NIST",
      designUrl: "https://131002.net/blake/"
    }
  ],
  [
    "jh",
    {
      designPaper: "JH",
      designVenue: "SHA-3 Submission to NIST",
      designUrl: "https://ehash.isec.tugraz.at/wiki/JH.html"
    }
  ],
  [
    "keccak-sha-3",
    {
      designPaper: "Keccak Specifications",
      designVenue: "SHA-3 Submission to NIST",
      designUrl: "https://keccak.team/files/Keccak-reference-3.0.pdf"
    }
  ],
  [
    "ascon",
    {
      designPaper: "Ascon v1.2: Lightweight Authenticated Encryption and Hashing",
      designVenue: "Journal of Cryptology",
      designUrl: "https://link.springer.com/article/10.1007/s00145-021-09398-9"
    }
  ],
  [
    "gimli",
    {
      designPaper: "Gimli: A Cross-Platform Permutation",
      designVenue: "CHES 2017",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-319-66787-4_18"
    }
  ],
  [
    "xoodyak-xoodoo",
    {
      designPaper: "Xoodyak, a Lightweight Cryptographic Scheme",
      designVenue: "IACR ToSC 2020",
      designUrl: "https://tosc.iacr.org/index.php/ToSC/article/view/8618"
    }
  ],
  [
    "photon",
    {
      designPaper: "PHOTON: A Lightweight Hash Function Family",
      designVenue: "CRYPTO 2011",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-642-22792-9_13"
    }
  ],
  [
    "spongent",
    {
      designPaper: "Spongent: A Lightweight Hash Function",
      designVenue: "CHES 2011",
      designUrl: "https://link.springer.com/chapter/10.1007/978-3-642-23951-9_20"
    }
  ],
  [
    "chaskey",
    {
      designPaper: "Chaskey: An Efficient MAC Algorithm for 32-bit Microcontrollers",
      designVenue: "SAC 2014",
      designUrl: "https://eprint.iacr.org/2014/386"
    }
  ]
]);

const file = resolve("db/attacks.json");
const database = JSON.parse(await readFile(file, "utf8"));
const knownKeys = new Set(database.records.map((record) => record.algorithmKey));
const missing = [...knownKeys].filter((key) => !publicationMap.has(key));
const now = new Date();
const localDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai"
}).format(now);

if (missing.length) {
  throw new Error(`Missing design publication metadata for: ${missing.join(", ")}`);
}

for (const record of database.records) {
  const publication = publicationMap.get(record.algorithmKey);
  record.designPaper = publication.designPaper;
  record.designVenue = publication.designVenue;
  record.designUrl = publication.designUrl;
  delete record.designYear;
}

database.generatedAt = now.toISOString();
database.meta = {
  ...database.meta,
  updated: localDate
};

await writeFile(file, `${JSON.stringify(database, null, 2)}\n`);
