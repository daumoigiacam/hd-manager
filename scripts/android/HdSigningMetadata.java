import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;

// Public metadata only. Null-password load does not guess a password and
// cannot prove integrity/private-key access. Never prints exception details,
// key bytes, passwords or a password-bearing command line.
class HdSigningMetadata {
  static String hex(byte[] b) { return HexFormat.of().formatHex(b); }
  public static void main(String[] args) throws Exception {
    Path file=Path.of(args[0]);String alias=args[1];
    byte[] first;try(InputStream in=Files.newInputStream(file)){first=in.readNBytes(4);}
    String type=Arrays.equals(first,new byte[]{(byte)0xfe,(byte)0xed,(byte)0xfe,(byte)0xed})?"JKS":"PKCS12";
    String store=System.getenv("HD_RELEASE_STORE_PASSWORD"),password=System.getenv("HD_RELEASE_KEY_PASSWORD");
    boolean supplied=store!=null&&!store.isBlank()&&password!=null&&!password.isBlank();
    char[] sp=store==null?null:store.toCharArray(),kp=password==null?null:password.toCharArray();
    try {
      KeyStore ks=KeyStore.getInstance(type);
      try(InputStream in=Files.newInputStream(file)){ks.load(in,sp);}
      boolean found=ks.containsAlias(alias);java.security.cert.Certificate cert=found?ks.getCertificate(alias):null;
      String fingerprint=cert==null?null:hex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
      boolean usable=false;
      if(supplied&&found&&cert!=null){
        Key key=ks.getKey(alias,kp);
        if(!(key instanceof PrivateKey))throw new GeneralSecurityException();
        byte[] nonce=new byte[32];new SecureRandom().nextBytes(nonce);
        String algorithm="RSA".equals(key.getAlgorithm())?"SHA256withRSA":"SHA256withECDSA";
        Signature sign=Signature.getInstance(algorithm);sign.initSign((PrivateKey)key);sign.update(nonce);byte[] proof=sign.sign();
        Signature verify=Signature.getInstance(algorithm);verify.initVerify(cert);verify.update(nonce);usable=verify.verify(proof);
        Arrays.fill(nonce,(byte)0);Arrays.fill(proof,(byte)0);
        if(cert instanceof X509Certificate)((X509Certificate)cert).checkValidity();
      }
      System.out.println("{\"type\":\""+type+"\",\"alias\":\"hdmanager-upload\",\"aliasFound\":"+found+",\"certificateSha256\":"+(fingerprint==null?"null":"\""+fingerprint+"\"")+",\"integrityVerified\":"+supplied+",\"privateKeyVerified\":"+usable+",\"passwordPrinted\":false}");
      if(supplied&&!usable)System.exit(2);
    } catch(Exception e) {
      System.out.println("{\"type\":\""+type+"\",\"alias\":\"hdmanager-upload\",\"status\":\""+(supplied?"SIGNING_CREDENTIALS_REJECTED":"PUBLIC_CERTIFICATE_REQUIRES_PASSWORD")+"\",\"integrityVerified\":false,\"privateKeyVerified\":false,\"passwordPrinted\":false}");
      if(supplied)System.exit(2);
    } finally {if(sp!=null)Arrays.fill(sp,'\0');if(kp!=null)Arrays.fill(kp,'\0');}
  }
}
