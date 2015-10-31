exports = function (domain, outputPath, cb) {
  var fs    = require('fs')
  var path  = require("path");
  var forge = require('node-forge')
  var rsa   = forge.pki.rsa

  var subject = [{
    name: 'commonName',
    value: domain
  }, {
    name: 'countryName',
    value: 'CN'
  }, {
    shortName: 'ST',
    value: 'ZJ'
  }, {
    name: 'localityName',
    value: 'HZ'
  }, {
    name: 'organizationName',
    value: 'Alibaba'
  }, {
    shortName: 'OU',
    value: 'FE'
  }]
  var srl     = 'C41C8AA3025C0808'

  //make csr
  var keypair   = rsa.generateKeyPair({bits: 2048, e: 0x10001})
  var csr       = forge.pki.createCertificationRequest()
  csr.publicKey = keypair.publicKey
  csr.setSubject(subject)
  csr.sign(keypair.privateKey, forge.md.sha256.create())

  fs.writeFileSync(path.join(outputPath, domain + ".key"), forge.pki.privateKeyToPem(keypair.privateKey))

  // Read CA cert and key
  var caCertPem = fs.readFileSync(outputPath + "/rootCA.crt", 'utf8')
  var caKeyPem  = fs.readFileSync(outputPath + "/rootCA.key", 'utf8')
  var caCert    = forge.pki.certificateFromPem(caCertPem)
  var caKey     = forge.pki.privateKeyFromPem(caKeyPem)

  var cert          = forge.pki.createCertificate()
  cert.serialNumber = srl

  cert.validity.notBefore = new Date()
  cert.validity.notAfter  = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  // subject from CSR
  cert.setSubject(csr.subject.attributes)
  // issuer from CA
  cert.setIssuer(caCert.subject.attributes)

  cert.publicKey = csr.publicKey

  cert.sign(caKey, forge.md.sha256.create())

  fs.writeFileSync(path.join(outputPath, domain + ".cert"), forge.pki.certificateToPem(cert))

  cb()
}
