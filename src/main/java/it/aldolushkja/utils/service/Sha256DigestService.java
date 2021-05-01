package it.aldolushkja.utils.service;

import it.aldolushkja.utils.enumz.DigestType;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

import org.slf4j.Logger;

@ApplicationScoped
public class Sha256DigestService implements DigestContent {

  @Inject
  Logger log;

  @Override
  public String digest(String plainText) {
    MessageDigest digest;
    String sha1 = "";
    try {
      digest = MessageDigest.getInstance(DigestType.SHA256.getValue());
      digest.reset();
      digest.update(plainText.getBytes(StandardCharsets.UTF_8));
      sha1 = String.format("%040x", new BigInteger(1, digest.digest()));
      log.info("Sha256DigestService.digest() --- input: " + plainText + ", output: " + sha1);

      return sha1;

    } catch (NoSuchAlgorithmException e) {
      e.printStackTrace();
      log.error("Sha256DigestService.digest() --- message: " + e.getMessage());
      return "Something goes wrong :-(";
    }
  }

}
