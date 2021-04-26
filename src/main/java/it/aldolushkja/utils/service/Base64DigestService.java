package it.aldolushkja.utils.service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.logging.Logger;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

@ApplicationScoped
public class Base64DigestService implements DigestContent {

  @Inject
  Logger log;

  @Override
  public String digest(String plainText) {

    final byte[] byteEncoded = Base64.getEncoder()
        .encode(plainText.getBytes(StandardCharsets.UTF_8));
    return new String(byteEncoded);
    //    MessageDigest digest;
//    String sha1 = "";
//    try {
//      digest = MessageDigest.getInstance(DigestType.SHA1.getValue());
//      digest.reset();
//      digest.update(plainText.getBytes(StandardCharsets.UTF_8));
//      sha1 = String.format("%040x", new BigInteger(1, digest.digest()));
//      log.info("Sha1DigestService.digest() --- input: " + plainText + ", output: " + sha1);
//
//      return sha1;
//
//    } catch (NoSuchAlgorithmException e) {
//      // TODO Auto-generated catch block
//      e.printStackTrace();
//      log.severe("Sha1DigestService.digest() --- message: " + e.getMessage());
//      return "Something goes wrong :-(";
//    }
  }

  public String decode(String encoded) {
    final byte[] decoded = Base64.getDecoder().decode(encoded);
    return new String(decoded);
  }

}
