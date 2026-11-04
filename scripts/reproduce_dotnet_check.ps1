Add-Type -AssemblyName System.Security

function Test-PdfCmsSignature {
    param (
        [string]$FilePath
    )

    Write-Host "========================================================================"
    Write-Host "INDEPENDENT .NET / SignedCms VALIDATION FOR: $FilePath"
    Write-Host "========================================================================"

    if (-not (Test-Path $FilePath)) {
        Write-Error "File not found: $FilePath"
        return
    }

    $pdfBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $pdfStr = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($pdfBytes)

    # 1. Parse /ByteRange
    if ($pdfStr -match '/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]') {
        $o1 = [int]$matches[1]
        $l1 = [int]$matches[2]
        $o2 = [int]$matches[3]
        $l2 = [int]$matches[4]
        Write-Host "1. PDF /ByteRange: [$o1, $l1, $o2, $l2]"

        $signedBytes = New-Object byte[] ($l1 + $l2)
        [Array]::Copy($pdfBytes, $o1, $signedBytes, 0, $l1)
        [Array]::Copy($pdfBytes, $o2, $signedBytes, $l1, $l2)
        Write-Host "   Reconstructed signed byte stream length: $($signedBytes.Length) bytes"
    } else {
        Write-Error "   /ByteRange not found in PDF"
        return
    }

    # 2. Extract /Contents PKCS#7 / CMS signature container
    if ($pdfStr -match '/Contents\s*<([0-9a-fA-F]+)>') {
        $hex = $matches[1]
        $sigBytes = New-Object byte[] ($hex.Length / 2)
        for ($i = 0; $i -lt $hex.Length; $i += 2) {
            $sigBytes[$i / 2] = [Convert]::ToByte($hex.Substring($i, 2), 16)
        }
        Write-Host "2. Extracted /Contents signature payload: $($sigBytes.Length) bytes (DER encoded)"

        # 3. Create ContentInfo with detached signed bytes
        $contentInfo = New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList @(,$signedBytes)
        # Detached = $true
        $signedCms = New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $contentInfo, $true

        try {
            $signedCms.Decode($sigBytes)
            Write-Host "3. ASN.1 CMS/PKCS#7 Structure: VALID DER ENCODING"
            Write-Host "   Number of Signers: $($signedCms.SignerInfos.Count)"
            $signer = $signedCms.SignerInfos[0]
            Write-Host "   Signer Certificate Subject: $($signer.Certificate.Subject)"
            Write-Host "   Signer Certificate Serial:  $($signer.Certificate.SerialNumber)"
            Write-Host "   Digest Algorithm:           $($signer.DigestAlgorithm.FriendlyName)"
        } catch {
            Write-Host "3. ASN.1 CMS/PKCS#7 Structure: DECODE FAILED"
            Write-Host "   Error: $($_.Exception.Message)"
            return
        }

        # 4. Check Signature Cryptographic Validity (verifySignatureOnly = $true)
        Write-Host "4. Cryptographic Signature Integrity Check (verifySignatureOnly = `$true):"
        try {
            $signedCms.CheckSignature($true)
            Write-Host "   >>> RESULT: VALID (Cryptographic signature & document integrity verified!) <<<"
        } catch {
            Write-Host "   >>> RESULT: INVALID (Signature check failed: $($_.Exception.Message)) <<<"
        }

        # 5. Check Trust Chain / Root Authority (verifySignatureOnly = $false)
        Write-Host "5. Certificate Trust Chain Verification (verifySignatureOnly = `$false):"
        try {
            $signedCms.CheckSignature($false)
            Write-Host "   >>> RESULT: TRUSTED (Certificate chain terminates in a trusted root) <<<"
        } catch {
            Write-Host "   >>> RESULT: UNTRUSTED / SELF-ISSUED (`$_.Exception.Message: $($_.Exception.Message)) <<<"
        }
    } else {
        Write-Error "   /Contents signature dictionary not found in PDF"
        return
    }

    Write-Host ""
}

if ($args.Count -gt 0) {
    foreach ($arg in $args) {
        Test-PdfCmsSignature $arg
    }
} else {
    Test-PdfCmsSignature "data/test_packages/receipt_TEST-1001_signed.pdf"
    Test-PdfCmsSignature "data/test_packages/receipt_TEST-1001_tampered.pdf"
}
