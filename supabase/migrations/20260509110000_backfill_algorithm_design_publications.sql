alter table public.algorithms
add column if not exists design_paper text,
add column if not exists design_venue text,
add column if not exists design_url text;

with design_publications(id, design_paper, design_venue, design_url) as (
  values
    ('aes-128', 'AES Proposal: Rijndael', 'AES Candidate Submission 1998', 'https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf'),
    ('aes-128-192-256', 'AES Proposal: Rijndael', 'AES Candidate Submission 1998', 'https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf'),
    ('aes-256', 'AES Proposal: Rijndael', 'AES Candidate Submission 1998', 'https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/aes-development/Rijndael-ammended.pdf'),
    ('aria-128', 'A Description of the ARIA Encryption Algorithm', 'RFC 5794', 'https://www.rfc-editor.org/rfc/rfc5794'),
    ('ascon', 'Ascon v1.2: Lightweight Authenticated Encryption and Hashing', 'Journal of Cryptology', 'https://link.springer.com/article/10.1007/s00145-021-09398-9'),
    ('blake-32', 'BLAKE', 'SHA-3 Submission to NIST', 'https://131002.net/blake/'),
    ('camellia-128', 'A Description of the Camellia Encryption Algorithm', 'RFC 3713', 'https://www.rfc-editor.org/rfc/rfc3713'),
    ('chaskey', 'Chaskey: An Efficient MAC Algorithm for 32-bit Microcontrollers', 'SAC 2014', 'https://eprint.iacr.org/2014/386'),
    ('clefia-128', 'The 128-Bit Blockcipher CLEFIA', 'RFC 6114', 'https://www.rfc-editor.org/rfc/rfc6114'),
    ('des', 'Data Encryption Standard', 'NIST FIPS 46-3', 'https://csrc.nist.gov/pubs/fips/46-3/final'),
    ('gift-64', 'GIFT: A Small Present', 'CHES 2017', 'https://link.springer.com/chapter/10.1007/978-3-319-66787-4_16'),
    ('gimli', 'Gimli: A Cross-Platform Permutation', 'CHES 2017', 'https://link.springer.com/chapter/10.1007/978-3-319-66787-4_18'),
    ('gr-stl-256', 'Grøstl - a SHA-3 Candidate', 'SHA-3 Submission to NIST', 'http://www.groestl.info/Groestl.pdf'),
    ('jh', 'JH', 'SHA-3 Submission to NIST', 'https://ehash.isec.tugraz.at/wiki/JH.html'),
    ('kasumi', 'Specification of the 3GPP Confidentiality and Integrity Algorithms UEA2 and UIA2', '3GPP TS 35.202', 'https://www.etsi.org/deliver/etsi_ts/135200_135299/135202/17.00.00_60/ts_135202v170000p.pdf'),
    ('keccak-sha-3', 'Keccak Specifications', 'SHA-3 Submission to NIST', 'https://keccak.team/files/Keccak-reference-3.0.pdf'),
    ('kuznyechik', 'GOST R 34.12-2015: Block Cipher Kuznyechik', 'RFC 7801', 'https://www.rfc-editor.org/rfc/rfc7801'),
    ('led-64', 'LED: A Lightweight Block Cipher', 'CHES 2011', 'https://link.springer.com/chapter/10.1007/978-3-642-23951-9_22'),
    ('md4', 'The MD4 Message-Digest Algorithm', 'RFC 1320', 'https://www.rfc-editor.org/rfc/rfc1320'),
    ('md5', 'The MD5 Message-Digest Algorithm', 'RFC 1321', 'https://www.rfc-editor.org/rfc/rfc1321'),
    ('misty1', 'New Block Encryption Algorithm MISTY', 'FSE 1997', 'https://doi.org/10.1007/BFb0052334'),
    ('photon', 'PHOTON: A Lightweight Hash Function Family', 'CRYPTO 2011', 'https://link.springer.com/chapter/10.1007/978-3-642-22792-9_13'),
    ('present', 'PRESENT: An Ultra-Lightweight Block Cipher', 'CHES 2007', 'https://doi.org/10.1007/978-3-540-74735-2_31'),
    ('present-80', 'PRESENT: An Ultra-Lightweight Block Cipher', 'CHES 2007', 'https://doi.org/10.1007/978-3-540-74735-2_31'),
    ('prince', 'PRINCE - A Low-Latency Block Cipher for Pervasive Computing Applications', 'ASIACRYPT 2012', 'https://link.springer.com/chapter/10.1007/978-3-642-34961-4_12'),
    ('rc6', 'The RC6 Block Cipher', 'AES Candidate Submission 1998', 'https://www.cerias.purdue.edu/apps/reports_and_papers/view/2029'),
    ('ripemd', 'Integrity Primitives for Secure Information Systems: Final RIPE Report of RACE Integrity Primitives Evaluation', 'LNCS 1007 / Springer', 'https://link.springer.com/book/10.1007/3-540-60640-8'),
    ('serpent', 'Serpent: A Candidate Block Cipher for the Advanced Encryption Standard', 'AES Candidate Submission 1998', 'https://www.cl.cam.ac.uk/archive/rja14/Papers/serpent.pdf'),
    ('sha-1', 'Secure Hash Standard', 'NIST FIPS 180-1', 'https://csrc.nist.gov/pubs/fips/180-1/final'),
    ('sha-256', 'Secure Hash Standard (SHS)', 'NIST FIPS 180-4', 'https://csrc.nist.gov/pubs/fips/180-4/upd1/final'),
    ('sha-512', 'Secure Hash Standard (SHS)', 'NIST FIPS 180-4', 'https://csrc.nist.gov/pubs/fips/180-4/upd1/final'),
    ('simon32-64', 'The Simon and Speck Families of Lightweight Block Ciphers', 'IACR ePrint 2013/404', 'https://eprint.iacr.org/2013/404'),
    ('skein-512', 'The Skein Hash Function Family', 'SHA-3 Submission to NIST', 'https://www.schneier.com/wp-content/uploads/2015/01/skein.pdf'),
    ('skinny-64-128', 'The SKINNY Family of Block Ciphers and Its Low-Latency Variant MANTIS', 'CRYPTO 2016', 'https://link.springer.com/chapter/10.1007/978-3-662-53008-5_5'),
    ('sm4-sms4', 'The SM4 Block Cipher Algorithm and Its Modes of Operations', 'IETF Internet-Draft / GB/T 32907-2016', 'https://datatracker.ietf.org/doc/html/draft-ribose-cfrg-sm4'),
    ('speck32-64', 'The Simon and Speck Families of Lightweight Block Ciphers', 'IACR ePrint 2013/404', 'https://eprint.iacr.org/2013/404'),
    ('spongent', 'Spongent: A Lightweight Hash Function', 'CHES 2011', 'https://link.springer.com/chapter/10.1007/978-3-642-23951-9_20'),
    ('twofish', 'Twofish: A 128-Bit Block Cipher', 'AES Candidate Submission 1998', 'https://www.schneier.com/wp-content/uploads/2016/02/paper-twofish-paper.pdf'),
    ('whirlpool', 'Whirlpool: A Hash Function Based on AES', 'First Open NESSIE Workshop', 'https://www.larc.usp.br/~pbarreto/WhirlpoolPage.html'),
    ('xoodyak-xoodoo', 'Xoodyak, a Lightweight Cryptographic Scheme', 'IACR ToSC 2020', 'https://tosc.iacr.org/index.php/ToSC/article/view/8618')
)
update public.algorithms as algorithms
set
  design_paper = design_publications.design_paper,
  design_venue = design_publications.design_venue,
  design_url = design_publications.design_url,
  updated_at = now()
from design_publications
where algorithms.id = design_publications.id;

