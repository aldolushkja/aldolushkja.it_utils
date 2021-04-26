package it.aldolushkja.utils.service;

import java.util.logging.Logger;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

@ApplicationScoped
public class DigestFactory {

  @Inject
  Logger log;

  @Inject
  Sha1DigestService sha1DigestService;

  @Inject
  Sha256DigestService sha256DigestService;

  @Inject
  Sha512DigestService sha512DigestService;

  @Inject
  Base64DigestService base64DigestService;

  public String getSha1(String text) {
    return sha1DigestService.digest(text);
  }

  public String getSha256(String text) {
    return sha256DigestService.digest(text);
  }

  public String encodeWithBase64(String plainText) {
    return base64DigestService.digest(plainText);
  }


  public String decodeBase64(String encoded) {
    return base64DigestService.decode(encoded);
  }


  public String getSha512(String text) {
    return sha512DigestService.digest(text);
  }

}
