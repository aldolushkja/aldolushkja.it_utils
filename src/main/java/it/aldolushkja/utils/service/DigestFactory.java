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

  public String getSha1(String text) {
    return sha1DigestService.digest(text);
  }

  public String getSha256(String text) {
    return sha256DigestService.digest(text);
  }


  public String getSha512(String text) {
    return sha512DigestService.digest(text);
  }

}
