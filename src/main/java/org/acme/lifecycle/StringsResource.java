package org.acme.lifecycle;

import java.util.UUID;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.MediaType;

@Path("/strings")
@Loggable
public class StringsResource {

  @Inject
  Logger log;

  @Inject
  DigestFactory factory;

  @GET
  @Path("/uuid")
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomUUID() {
    String output = UUID.randomUUID().toString();
    log.info("StringsResource.getRandomUUID() ---- output " + output);
    return output;
  }

  @GET
  @Path("/sha1")
  @Produces(MediaType.TEXT_PLAIN)
  public String getSha1(@QueryParam("text") String text) {
    if (text == null || text.isBlank()) {
      return "Fullfill the request with [ ?text=<what you want> ]";
    }
    return factory.getSha1(text);
  }

  @GET
  @Path("/sha256")
  @Produces(MediaType.TEXT_PLAIN)
  public String getSha256(@QueryParam("text") String text) {
    if (text == null || text.isBlank()) {
      return "Fullfill the request with [ ?text=<what you want> ]";
    }
    return factory.getSha256(text);
  }

}
