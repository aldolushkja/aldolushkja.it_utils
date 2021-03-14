package org.acme.lifecycle;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.logging.Logger;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

@ApplicationScoped
public class Sha1Digest implements DigestContent {

  @Inject
  Logger log;

  @Override
  public String digest(String plainText) {
    MessageDigest digest;
    String sha1 = "";
    try {
      digest = MessageDigest.getInstance(DigestType.SHA1.getValue());
      digest.reset();
      digest.update(plainText.getBytes(StandardCharsets.UTF_8));
      sha1 = String.format("%040x", new BigInteger(1, digest.digest()));
      log.info("Sha1Digest.digest() --- input: " + plainText + ", output: " + sha1);

      return sha1;

    } catch (NoSuchAlgorithmException e) {
      // TODO Auto-generated catch block
      e.printStackTrace();
      log.severe("Sha1Digest.digest() --- message: " + e.getMessage());
      return "Something goes wrong :-(";
    }
  }

}
