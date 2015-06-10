#!/bin/bash
 
#Required
domain=$1
outputPath=$2
commonname=$domain

country=CN
state=ZJ
locality=HZ
organization=Alibaba
organizationalunit=FE
email=fe@alibaba-inc.com
password=123456

#Generate a key
/usr/bin/openssl genrsa -passout pass:$password -out $outputPath/$domain.key 2048

#Remove passphrase from the key. Comment the line out to keep the passphrase
/usr/bin/openssl rsa -in $outputPath/$domain.key -passin pass:$password -out $outputPath/$domain.key
 
#Create the request
/usr/bin/openssl req -new -sha256 -key $outputPath/$domain.key -out $outputPath/$domain.csr -passin pass:$password -subj "/C=$country/ST=$state/L=$locality/O=$organization/OU=$organizationalunit/CN=$commonname/emailAddress=$email"
 
#Generating a Self-Signed Certificate
/usr/bin/openssl x509 -req -sha256 -days 36500 -in $outputPath/$domain.csr -CA ${outputPath}/../rootCA.crt -CAkey ${outputPath}/../rootCA.key -CAserial $outputPath/../.srl -out $outputPath/$domain.crt

rm $outputPath/$domain.csr