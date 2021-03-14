package org.acme.lifecycle;

import java.util.logging.Logger;
import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

@ApplicationScoped
public class DigestFactory {

  @Inject
  Logger log;

  @Inject
  Sha1Digest sha1Digest;

  @Inject
  Sha256Digest sha256Digest;

  @Inject
  Sha512Digest sha512Digest;

  public String getSha1(String text) {
    return sha1Digest.digest(text);
  }

  public String getSha256(String text) {
    return sha256Digest.digest(text);
  }


  public String getSha512(String text) {
    return sha512Digest.digest(text);
  }

}
