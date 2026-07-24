'use strict'

const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const subject = 'CN=PhonetoFR GitHub Desktop Zh'
const certName = 'PhonetoFR GitHubDesktopZh CodeSign'
const outputDir = path.join(__dirname, '..', 'build-resources')
const pfxPath = path.join(outputDir, 'codesign.pfx')
const passwordPath = path.join(outputDir, 'codesign-password.txt')

if (fs.existsSync(pfxPath) && fs.existsSync(passwordPath)) {
  console.log('代码签名证书已存在，跳过生成。')
  process.exit(0)
}

fs.mkdirSync(outputDir, { recursive: true })

const password = crypto.randomBytes(32).toString('base64url')

function escapePs(str) {
  return str.replace(/'/g, "''")
}

const psScript = [
  "$ErrorActionPreference = 'Stop'",
  "$cert = New-SelfSignedCertificate -Type CodeSigningCert -DnsName 'githubdesktop-zh.local' -Subject '" + escapePs(subject) + "' -FriendlyName '" + escapePs(certName) + "' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 4096 -HashAlgorithm SHA256 -CertStoreLocation 'Cert:\\CurrentUser\\My' -NotAfter (Get-Date).AddYears(5)",
  "$pw = ConvertTo-SecureString -String '" + escapePs(password) + "' -Force -AsPlainText",
  "Export-PfxCertificate -Cert $cert -FilePath '" + escapePs(pfxPath) + "' -Password $pw -Force | Out-Null",
  "Remove-Item -Path ('Cert:\\CurrentUser\\My\\' + $cert.Thumbprint) -Force",
].join('\n')

try {
  execFileSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'inherit' })
} catch (error) {
  console.error('生成代码签名证书失败:', error.message || error)
  console.log('将以未签名形式继续构建。')
  process.exit(0)
}

fs.writeFileSync(passwordPath, password, 'utf8')
console.log('已生成自签名代码签名证书:', pfxPath)