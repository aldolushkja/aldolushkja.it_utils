package org.acme.lifecycle;

import java.util.logging.Logger;
import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("/numbers")
@Loggable
public class NumbersResource {

  @Inject
  Logger log;

  @GET
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomNumber() {
    String output = String.valueOf(Math.random());
    log.info("NumbersResource.getRandomNumber() --- output: " + output);
    return output;
  }

}
